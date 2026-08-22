import type { PendingTestDto } from "@sdk";

export interface PendingTest {
  name: string;
  viewport?: string;
  browser?: string;
  environment?: string;
}

export function mapPendingTest(dto: PendingTestDto): PendingTest {
  return {
    name: dto.name,
    ...(dto.variant ?? {}),
  };
}

export function mapPendingTests(dtos: PendingTestDto[] = []): PendingTest[] {
  return dtos.map(mapPendingTest);
}
