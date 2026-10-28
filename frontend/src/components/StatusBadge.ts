import { h, type Component } from "vue";
import { i18n } from "@/i18n";
import { Check, Clock, HelpCircle } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { getStatusConfig } from "@/domains/test-status";
import type { StatusIcon } from "@/domains/test-status";

const STATUS_LABEL_KEY: Record<string, string> = {
  PENDING: "status.noBaseline",
  UNCHANGED: "status.unchanged",
  PENDING_APPROVAL: "status.pending",
  APPROVED: "status.approved",
};

export function statusLabelFor(status?: string | null): string {
  const key = status ? STATUS_LABEL_KEY[status] : undefined;
  return key ? i18n.global.t(key) : i18n.global.t("status.baselineOnly");
}

const icons: Record<StatusIcon, Component> = {
  check: Check,
  clock: Clock,
  "help-circle": HelpCircle,
};

export function getStatusBadge(status?: string | null) {
  const cfg = getStatusConfig(status);

  return h(
    Badge,
    {
      variant: "outline",
      class: `text-xs flex items-center gap-1 py-0.5 px-1.5 ${cfg.class}`,
    },
    () => [
      h(icons[cfg.icon], { class: "w-3 h-3 opacity-80" }),
      statusLabelFor(status),
    ],
  );
}

export function getStatusCountBadge(
  status: string | null | undefined,
  count: number,
  options: { icon?: StatusIcon; className?: string; label?: string } = {},
) {
  const cfg = getStatusConfig(status);
  const icon = options.icon
    ? h(icons[options.icon], { class: "w-3 h-3 opacity-80" })
    : null;

  return h(
    Badge,
    {
      variant: "outline",
      class: `text-xs flex items-center gap-1 ${cfg.class} ${options.className ?? ""}`,
    },
    () => [icon, options.label ? `${count} ${options.label}` : String(count)],
  );
}
