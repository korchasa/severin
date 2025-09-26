/**
 * @fileoverview Utility for YAML serialization with Deno compatibility
 *
 * This module provides YAML dumping functionality with fallback to JSON inspection.
 * It handles both Jest test environment and Deno runtime, converting Node.js util.inspect
 * calls to Deno-compatible alternatives.
 *
 * @author Server Agent Team
 * @version 1.0.0
 */

import { stringify, YAMLSeq } from "yaml";

/**
 * Recursively converts simple arrays to flow style for more compact YAML output
 *
 * This function processes nested objects and arrays, converting simple arrays
 * (containing only primitives) to YAML flow style for more compact representation.
 * Complex arrays are processed recursively to maintain structure.
 *
 * @param value - The value to process (can be any type)
 * @returns Processed value with simple arrays converted to flow style
 */
function convertSimpleArraysToFlowStyle(value: unknown): unknown {
  if (Array.isArray(value)) {
    // Check if all elements are simple (string, number, boolean, null)
    // This determines whether we can use compact flow style
    const isSimpleArray = value.every(
      (item) =>
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean" ||
        item === null,
    );

    if (isSimpleArray) {
      // Create flow style array for compact representation
      // Flow style: [item1, item2, item3] instead of block style
      const seq = new YAMLSeq();
      seq.flow = true;
      value.forEach((item) => seq.add(item));
      return seq;
    } else {
      // Recursively process complex arrays to handle nested structures
      return value.map(convertSimpleArraysToFlowStyle);
    }
  } else if (value && typeof value === "object" && !(value instanceof YAMLSeq)) {
    // Process object properties recursively to handle nested objects
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = convertSimpleArraysToFlowStyle(val);
    }
    return result;
  }

  // Return primitive values unchanged
  return value;
}

/**
 * Simple object inspection function for Deno (replaces util.inspect)
 *
 * Provides a Deno-compatible alternative to Node.js util.inspect for object serialization.
 * Uses JSON.stringify with pretty formatting as the primary method, falling back to
 * String conversion for non-serializable values.
 *
 * @param value - The value to inspect
 * @param depth - Maximum depth for inspection (currently unused, kept for compatibility)
 * @returns String representation of the value
 */
function inspectObject(value: unknown, _depth = 6): string {
  try {
    // Use JSON.stringify for pretty-printed output
    return JSON.stringify(value, null, 2);
  } catch {
    // Fallback to string conversion for non-serializable values
    return String(value);
  }
}

/**
 * Serializes a value to YAML format with Deno compatibility
 *
 * Main export function that converts any value to YAML string representation.
 * Handles both Jest test environment and Deno runtime, with intelligent fallback
 * to JSON inspection when YAML serialization fails.
 *
 * @param value - The value to serialize to YAML
 * @returns YAML string representation
 */
export function yamlDump(value: unknown): string {
  // Detect Jest test environment for compatibility
  // In Deno, we check for JEST_WORKER_ID in environment variables
  const isJest = typeof Deno !== "undefined" && !!Deno.env.get("JEST_WORKER_ID");
  if (isJest) {
    // Use object inspection in test environment
    return inspectObject(value, 6);
  }

  try {
    // Convert simple arrays to flow style for more compact output
    const processedValue = convertSimpleArraysToFlowStyle(value);

    return stringify(processedValue, {
      indent: 2,
      // Do not fold long lines automatically to avoid unexpected newlines
      lineWidth: 0,
      minContentWidth: 20,
      // Use PLAIN by default so that multi-line strings are emitted as block scalars (|)
      // and single-line strings are not needlessly quoted
      defaultStringType: "PLAIN",
    });
  } catch {
    // Fall back to object inspection if YAML serialization fails
    return inspectObject(value, 6);
  }
}
