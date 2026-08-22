import { h, type Component } from "vue";
import { Check, Clock, HelpCircle } from "@lucide/vue";
import { Badge } from "@/components/ui/badge";
import { getStatusConfig, STATUS } from "@/domains/test-status";
import type { StatusIcon } from "@/domains/test-status";

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
    () => [h(icons[cfg.icon], { class: "w-3 h-3 opacity-80" }), cfg.label],
  );
}

export function getStatusCountBadge(
  status: string | null | undefined,
  count: number,
  options: { icon?: StatusIcon; className?: string } = {},
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
    () => [icon, String(count)],
  );
}

export function getProjectStatusBadge(hasPending: boolean) {
  const cfg = hasPending
    ? getStatusConfig(STATUS.PENDING_APPROVAL)
    : getStatusConfig(STATUS.APPROVED);

  return h(
    Badge,
    {
      variant: "outline",
      class: `text-xs flex items-center gap-1 py-0.5 px-2 ${cfg.class}`,
    },
    () => [h(icons[cfg.icon], { class: "w-3 h-3" }), cfg.label],
  );
}
