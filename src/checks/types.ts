/**
 * Types for the checks system
 */

export interface MetricValue {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
  readonly ts: string;
}
