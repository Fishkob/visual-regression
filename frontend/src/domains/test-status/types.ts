import type { TestStatus, ComparisonStatus } from "@sdk";

export type TestStatusValue = (typeof TestStatus)[keyof typeof TestStatus];

export type VisualTestStatus = keyof typeof ComparisonStatus;

export type StatusValue = TestStatusValue | "APPROVED";
