---
title: The walk is the loader
date: 2026-10-17
summary: How the museum's 4-second walk-in hides the gallery's first WebGL compile, and why the camera waits at the doors.
tags: [three.js, react-three-fiber, performance]
draft: true
---

The projects page opens with a short walk: a line-art city, a museum, doors that swing open as the camera moves in. It looks like an intro. It's actually the loading screen.

## The problem

The gallery behind those doors is the expensive part: a hall of glass cases, each with a looping demo video on a screen. The first time it renders, the browser compiles shaders and uploads textures, and that first frame can hitch badly. A spinner in front of it would work, but a spinner is dead time.

## Mount it early, keep it quiet

As soon as the walk starts, the gallery mounts underneath it, hidden, with React Three Fiber's frame loop set to `demand`:

```tsx
<Canvas frameloop={preload ? "demand" : "always"}>
```

On `demand` the scene only draws when something asks it to, so a hidden gallery isn't burning frames next to the visible walk. A small child component asks for exactly two frames, which is enough to get the compile and upload out of the way, then reports back:

```tsx
function Ready({ onReady }: { onReady: () => void }) {
  const { invalidate } = useThree();
  useEffect(() => {
    invalidate();
    const a = requestAnimationFrame(() => {
      invalidate();
      requestAnimationFrame(onReady);
    });
    return () => cancelAnimationFrame(a);
  }, [invalidate, onReady]);
  return null;
}
```

The gallery also waits for the walk to actually start before warming up, so the two scenes don't fight over the very first compile.

## Wait at the doors

The walk takes about 4 seconds, eased. If the gallery is ready by the time the camera reaches the doors, it just keeps walking in. If it isn't, the camera parks at the doors with a "Turning the lights on" caption instead of walking into an empty hall. A gallery that never reports ready can't hold them shut forever: after 6 seconds the walk goes in anyway.

The walk's clock starts on its own first drawn frame, not when the component mounts, so a slow first paint of the city doesn't eat half the animation.

## What I'd do differently

<!-- your take: what surprised you, what you'd change, numbers you measured -->
