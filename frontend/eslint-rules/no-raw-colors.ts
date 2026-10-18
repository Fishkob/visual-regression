import type { Rule } from "eslint";

import { findRawColorUtilities } from "../src/lib/raw-color-utilities";

// The Literal visitor deliberately scans every string in src production files,
// not only class attributes: status/config modules keep class strings in plain
// objects (e.g. domains/test-status/display.ts). The trade-off is that a
// non-class string that happens to look like a palette utility is also
// reported.
export const noRawColors: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require semantic theme tokens instead of raw palette utilities",
    },
    messages: {
      rawColor:
        "Raw colour utility '{{ utility }}' — use a semantic theme token (bg-card, text-foreground, border-border, …).",
    },
    schema: [],
  },
  create(context) {
    const reported = new Set<object>();

    const check = (node: Rule.Node, value: string) => {
      const utilities = findRawColorUtilities(value);
      if (utilities.length === 0 || reported.has(node)) return;
      reported.add(node);
      context.report({
        node,
        messageId: "rawColor",
        data: { utility: utilities.join(", ") },
      });
    };

    const templateVisitor = {
      VAttribute(node: {
        key: unknown;
        value?: { type: string; value?: string };
      }) {
        const key = node.key as {
          type: string;
          name?: string;
          argument?: { type: string; name?: string };
        };
        let name: string | undefined;
        if (key.type === "VIdentifier") {
          name = key.name;
        } else if (
          key.type === "VDirectiveKey" &&
          key.argument?.type === "VIdentifier"
        ) {
          name = key.argument.name;
        }
        if (name !== "class") return;
        if (node.value?.type === "VLiteral" && node.value.value) {
          check(node.value as Rule.Node, node.value.value);
        }
      },
      Literal(node: { value?: unknown }) {
        if (typeof node.value === "string") {
          check(node as Rule.Node, node.value);
        }
      },
      TemplateElement(node: { value: { cooked?: string; raw: string } }) {
        check(node as Rule.Node, node.value.cooked ?? node.value.raw);
      },
    };

    return {
      ...(context.sourceCode.parserServices.defineTemplateBodyVisitor
        ? context.sourceCode.parserServices.defineTemplateBodyVisitor(
            templateVisitor,
            {
              Literal(node: { value?: unknown }) {
                if (typeof node.value === "string") {
                  check(node as Rule.Node, node.value);
                }
              },
              TemplateElement(node: {
                value: { cooked?: string; raw: string };
              }) {
                check(node as Rule.Node, node.value.cooked ?? node.value.raw);
              },
            },
          )
        : {}),
      Literal(node) {
        if (typeof node.value === "string") {
          check(node as Rule.Node, node.value);
        }
      },
      TemplateElement(node) {
        check(node as Rule.Node, node.value.cooked ?? node.value.raw);
      },
    };
  },
};
