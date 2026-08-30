import { BadRequestException, Controller, Get, NotFoundException, Param, UseGuards } from "@nestjs/common";

import { ProgressAuthGuard } from "../auth/progress-auth.guard";
import { ProgressService } from "./progress.service";

import type { PlanProgressView, PortfolioProgressView } from "./progress.service";

@Controller("v1/progress")
@UseGuards(ProgressAuthGuard)
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get()
  portfolio(): PortfolioProgressView {
    return this.progress.portfolio();
  }

  @Get(":planId")
  plan(@Param("planId") encodedPlanId: string): PlanProgressView {
    let planId: string;
    try {
      planId = decodeURIComponent(encodedPlanId);
    } catch {
      throw new BadRequestException("planId must be URL encoded");
    }
    const plan = this.progress.plan(planId);
    if (plan === null) throw new NotFoundException(`plan ${planId} was not found`);
    return plan;
  }
}
