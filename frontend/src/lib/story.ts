import { defineComponent, h, ref, type Component } from "vue";
import { useRouter } from "vue-router";

// Wraps a page view so a story can mount it at a given route. The gallery
// installs the real router, so the story only pushes the initialRoute — the
// view then reads params/query through useRouteParams exactly like in the app.
// Every routed view story shares this instead of re-typing the push + render.
//
// The view renders only after the push resolves. A page that builds a link from
// a route param (the run detail's "All runs" link) resolves that link during
// setup, and rendering one frame before the navigation lands throws "Missing
// required param" instead of showing the page.
export function createRoutedView(view: Component) {
  return defineComponent(
    (props: { initialRoute?: string }) => {
      const router = useRouter();
      const ready = ref(!props.initialRoute);
      if (props.initialRoute) {
        void router.push(props.initialRoute).finally(() => {
          ready.value = true;
        });
      }
      return () => (ready.value ? h(view) : null);
    },
    { props: ["initialRoute"] },
  );
}
