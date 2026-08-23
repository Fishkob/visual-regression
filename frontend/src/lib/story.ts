import { defineComponent, h, type Component } from "vue";
import { useRouter } from "vue-router";

// Wraps a page view so a story can mount it at a given route. The gallery
// installs the real router, so the story only pushes the initialRoute — the
// view then reads params/query through useRouteParams exactly like in the app.
// Every routed view story shares this instead of re-typing the push + render.
export function createRoutedView(view: Component) {
  return defineComponent(
    (props: { initialRoute?: string }) => {
      const router = useRouter();
      if (props.initialRoute) {
        void router.push(props.initialRoute);
      }
      return () => h(view);
    },
    { props: ["initialRoute"] },
  );
}
