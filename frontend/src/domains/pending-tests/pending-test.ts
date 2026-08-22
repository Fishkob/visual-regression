import type { PendingTestDto } from "@sdk";
import { variantFromDto } from "@/lib/variant-key";

export interface PendingTest {
  name: string;
  viewport?: string;
  browser?: string;
  environment?: string;
}

export function mapPendingTest(dto: PendingTestDto): PendingTest {
  return {
    name: dto.name,
    ...variantFromDto(dto.variant),
  };
}

export function mapPendingTests(dtos: PendingTestDto[] = []): PendingTest[] {
  return dtos.map(mapPendingTest);
}
