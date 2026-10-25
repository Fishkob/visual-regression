<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import {
  Inbox,
  KeyRound,
  LayoutGrid,
  ScrollText,
  ShieldCheck,
  UserCog,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
} from "@lucide/vue";
import { useSidebar } from "@/composables/useSidebar";
import { useReviewInboxCountQuery } from "@/composables/useReviewInbox";
import { useCurrentRole } from "@/composables/useAuth";
import { Button } from "@/components/ui/button";
import { TEST_ID } from "@/lib/test-ids";
import { useI18n } from "vue-i18n";

const route = useRoute();
const { t } = useI18n();
const { collapsed, toggle: toggleSidebar } = useSidebar();
const { data: pendingCount } = useReviewInboxCountQuery();
// The admin-only pages are hidden, not just guarded: a member/viewer has no use
// for links that would only land on the 403 page.
const { isAdmin } = useCurrentRole();

const onInbox = computed(() => route.name === "review-inbox");
const onProjects = computed(
  () => route.path === "/projects" || route.path.startsWith("/projects/"),
);
const onGroups = computed(
  () => route.path === "/groups" || route.path.startsWith("/groups/"),
);
const onApiKeys = computed(() => route.path === "/api-keys");
const onAudit = computed(() => route.path === "/audit");
const onUsers = computed(() => route.path === "/users");
const onSecurity = computed(() => route.path === "/settings/security");
const pending = computed(() => pendingCount.value ?? 0);
</script>

<template>
  <aside
    class="w-full border-b bg-card/40 transition-[width] duration-200 md:min-h-screen md:border-b-0 md:border-r"
    :class="collapsed ? 'md:w-16' : 'md:w-60'"
    :data-testid="TEST_ID.appSidebar"
    :data-collapsed="collapsed ? 'true' : 'false'"
  >
    <div
      class="flex items-center justify-between px-4 py-3 md:px-2"
      :class="collapsed ? 'md:justify-center' : ''"
    >
      <RouterLink
        to="/"
        class="truncate text-sm font-semibold tracking-tight"
        :class="collapsed ? 'md:hidden' : ''"
      >
        Visual Regression
      </RouterLink>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        class="hidden md:inline-flex"
        :aria-expanded="!collapsed"
        aria-controls="app-sidebar-nav"
        :aria-label="collapsed ? t('nav.expand') : t('nav.collapse')"
        :title="collapsed ? t('nav.expand') : t('nav.collapse')"
        :data-testid="TEST_ID.sidebarToggle"
        @click="toggleSidebar"
      >
        <PanelLeftOpen v-if="collapsed" class="h-4 w-4" />
        <PanelLeftClose v-else class="h-4 w-4" />
      </Button>
    </div>

    <nav
      id="app-sidebar-nav"
      class="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3 md:pb-0"
      :aria-label="t('nav.main')"
    >
      <RouterLink
        to="/"
        class="relative flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="[
          { 'bg-muted text-foreground': onInbox },
          collapsed ? 'md:justify-center md:px-0' : '',
        ]"
        :aria-current="onInbox ? 'page' : undefined"
        :aria-label="collapsed ? t('nav.inbox') : undefined"
        :title="collapsed ? t('nav.inbox') : undefined"
        :data-testid="TEST_ID.navInbox"
      >
        <Inbox class="h-4 w-4 shrink-0" />
        <span
          :class="collapsed ? 'md:hidden' : ''"
          :data-testid="TEST_ID.navInboxLabel"
        >
          {{ t("nav.inbox") }}
        </span>
        <span
          v-if="pending > 0"
          class="ml-auto rounded-full bg-status-warning/15 px-1.5 py-0.5 text-xs text-foreground"
          :class="collapsed ? 'md:hidden' : ''"
          :data-testid="TEST_ID.inboxBadge"
        >
          {{ pending }}
        </span>
        <span
          v-if="pending > 0 && collapsed"
          class="absolute right-2 top-2 hidden h-2 w-2 rounded-full bg-status-warning md:block"
          aria-hidden="true"
        />
      </RouterLink>

      <RouterLink
        to="/projects"
        class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="[
          { 'bg-muted text-foreground': onProjects },
          collapsed ? 'md:justify-center md:px-0' : '',
        ]"
        :aria-current="onProjects ? 'page' : undefined"
        :aria-label="collapsed ? t('nav.projects') : undefined"
        :title="collapsed ? t('nav.projects') : undefined"
        :data-testid="TEST_ID.navProjects"
      >
        <LayoutGrid class="h-4 w-4 shrink-0" />
        <span :class="collapsed ? 'md:hidden' : ''">Projects</span>
      </RouterLink>

      <RouterLink
        to="/groups"
        class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="[
          { 'bg-muted text-foreground': onGroups },
          collapsed ? 'md:justify-center md:px-0' : '',
        ]"
        :aria-current="onGroups ? 'page' : undefined"
        :aria-label="collapsed ? t('nav.groups') : undefined"
        :title="collapsed ? t('nav.groups') : undefined"
        :data-testid="TEST_ID.navGroups"
      >
        <Users class="h-4 w-4 shrink-0" />
        <span :class="collapsed ? 'md:hidden' : ''">Groups</span>
      </RouterLink>

      <RouterLink
        v-if="isAdmin"
        to="/api-keys"
        class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="[
          { 'bg-muted text-foreground': onApiKeys },
          collapsed ? 'md:justify-center md:px-0' : '',
        ]"
        :aria-current="onApiKeys ? 'page' : undefined"
        :aria-label="collapsed ? t('nav.apiKeys') : undefined"
        :title="collapsed ? t('nav.apiKeys') : undefined"
        :data-testid="TEST_ID.navApiKeys"
      >
        <KeyRound class="h-4 w-4 shrink-0" />
        <span :class="collapsed ? 'md:hidden' : ''">API keys</span>
      </RouterLink>

      <RouterLink
        v-if="isAdmin"
        to="/users"
        class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="[
          { 'bg-muted text-foreground': onUsers },
          collapsed ? 'md:justify-center md:px-0' : '',
        ]"
        :aria-current="onUsers ? 'page' : undefined"
        :aria-label="collapsed ? t('nav.users') : undefined"
        :title="collapsed ? t('nav.users') : undefined"
        :data-testid="TEST_ID.usersNavLink"
      >
        <UserCog class="h-4 w-4 shrink-0" />
        <span :class="collapsed ? 'md:hidden' : ''">Users</span>
      </RouterLink>

      <RouterLink
        v-if="isAdmin"
        to="/audit"
        class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="[
          { 'bg-muted text-foreground': onAudit },
          collapsed ? 'md:justify-center md:px-0' : '',
        ]"
        :aria-current="onAudit ? 'page' : undefined"
        :aria-label="collapsed ? t('nav.audit') : undefined"
        :title="collapsed ? t('nav.audit') : undefined"
        :data-testid="TEST_ID.auditNavLink"
      >
        <ScrollText class="h-4 w-4 shrink-0" />
        <span :class="collapsed ? 'md:hidden' : ''">Audit</span>
      </RouterLink>

      <RouterLink
        to="/settings/security"
        class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        :class="[
          { 'bg-muted text-foreground': onSecurity },
          collapsed ? 'md:justify-center md:px-0' : '',
        ]"
        :aria-current="onSecurity ? 'page' : undefined"
        :aria-label="collapsed ? t('nav.security') : undefined"
        :title="collapsed ? t('nav.security') : undefined"
        :data-testid="TEST_ID.securityNavLink"
      >
        <ShieldCheck class="h-4 w-4 shrink-0" />
        <span :class="collapsed ? 'md:hidden' : ''">Security</span>
      </RouterLink>
    </nav>
  </aside>
</template>
