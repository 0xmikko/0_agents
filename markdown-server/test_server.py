"""Connection regressions against the real HTTP server entrypoint, on an OS port."""

import http.client
import importlib.util
import socket
import socketserver
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock


class ServerConnectionsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        (root / "dev").mkdir()
        (root / "dev" / "example.md").write_text(
            "# Connection test\n\n```mermaid\ngraph LR\nA --> B\n```\n",
            encoding="utf-8",
        )
        spec = importlib.util.spec_from_file_location(
            "mdurl_server", Path(__file__).with_name("server.py")
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.ROOT, module.HOST, module.PORT = root, "127.0.0.1", 0
        self.accepted = threading.Event()
        accepted = self.accepted

        class ObservedHandler(module.Handler):
            def setup(self):
                super().setup()
                accepted.set()

        module.Handler = ObservedHandler
        ready = threading.Event()
        serve_forever = socketserver.BaseServer.serve_forever

        def serve(instance):
            self.server = instance
            ready.set()
            serve_forever(instance, poll_interval=0.01)

        with mock.patch.object(socketserver.BaseServer, "serve_forever", serve):
            self.thread = threading.Thread(target=module.main, daemon=True)
            self.thread.start()
            self.assertTrue(ready.wait(3), "server did not start")
        self.addCleanup(self.stop_server)
        self.address = self.server.server_address

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(3)
        self.assertFalse(self.thread.is_alive(), "server did not stop")

    def connect_idle(self):
        client = socket.create_connection(self.address, timeout=12)
        self.addCleanup(client.close)
        self.assertTrue(self.accepted.wait(3), "idle connection was not accepted")
        return client

    # @test-id: tst_agent_unit_mdurl_001
    # @scenario: scn_mdurl_connections_001
    # @covers: markdown-server/server.py::main
    # @deterministic: yes; accepted-socket event, OS-assigned port, bounded reads
    # @fixtures: temporary Markdown document; no external services
    def test_tst_agent_unit_mdurl_001_idle_connection_does_not_block_pages(self):
        self.connect_idle()
        for path, expected in (
            ("/dev/example", '<div class="mermaid">'),
            ("/", 'href="/dev/example"'),
        ):
            with self.subTest(path=path):
                connection = http.client.HTTPConnection(*self.address, timeout=1)
                try:
                    connection.request("GET", path)
                    response = connection.getresponse()
                    self.assertEqual(response.status, 200)
                    self.assertIn(expected, response.read().decode("utf-8"))
                except TimeoutError:
                    self.fail("an accepted idle connection blocked a complete HTTP request")
                finally:
                    connection.close()

    # @test-id: tst_agent_unit_mdurl_002
    # @scenario: scn_mdurl_connections_002
    # @covers: markdown-server/server.py::Handler
    # @deterministic: yes; accepted-socket event, bounded 12-second read
    # @fixtures: temporary document root; no external services
    def test_tst_agent_unit_mdurl_002_idle_connection_is_closed(self):
        client = self.connect_idle()
        try:
            self.assertEqual(client.recv(1), b"", "idle connection was not closed")
        except TimeoutError:
            self.fail("server kept an idle connection open for more than 12 seconds")


if __name__ == "__main__":
    unittest.main()
