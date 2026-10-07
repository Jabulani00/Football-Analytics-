import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Platform, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type Scrollable = ScrollView & { getScrollableNode?: () => HTMLElement | null };

function nodeOf(view: ScrollView | null): HTMLElement | null {
  if (!view) return null;
  const reader = view as Scrollable;
  return typeof reader.getScrollableNode === 'function' ? reader.getScrollableNode() : null;
}

/** Mouse drag scrolls the same way a finger does. Touch keeps the browser’s own pan. */
function useDragScroll(ref: RefObject<ScrollView | null>, horizontal: boolean) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = nodeOf(ref.current);
    if (!node) return;
    node.dataset.dragScroll = horizontal ? 'x' : 'y';
    node.style.cursor = 'grab';
    node.style.touchAction = horizontal ? 'pan-y' : 'pan-y';
    let originX = 0;
    let originY = 0;
    let originLeft = 0;
    let originTop = 0;
    let active = false;
    let moved = false;

    const blocked = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('input, textarea, select, a, [data-nodrag]'));
    };

    const down = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.button !== 0 || blocked(event.target)) return;
      active = true;
      moved = false;
      originX = event.clientX;
      originY = event.clientY;
      originLeft = node.scrollLeft;
      originTop = node.scrollTop;
    };
    const move = (event: PointerEvent) => {
      if (!active || event.pointerType === 'touch') return;
      const dx = event.clientX - originX;
      const dy = event.clientY - originY;
      if (!moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (horizontal && Math.abs(dy) > Math.abs(dx)) return;
      if (!horizontal && Math.abs(dx) > Math.abs(dy)) return;
      moved = true;
      node.style.cursor = 'grabbing';
      if (horizontal) node.scrollLeft = originLeft - dx;
      else node.scrollTop = originTop - dy;
      event.preventDefault();
    };
    const up = () => {
      if (!active) return;
      active = false;
      node.style.cursor = 'grab';
      if (!moved) return;
      const swallow = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
      };
      node.addEventListener('click', swallow, { capture: true, once: true });
    };

    node.addEventListener('pointerdown', down);
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
    };
  }, [horizontal, ref]);
}

export default function DragScroll({
  children,
  horizontal = false,
  fill = true,
  style,
  contentContainerStyle,
  scrollRef,
}: {
  children: ReactNode;
  horizontal?: boolean;
  /** Vertical page scroll fills the screen. A panel list stays at its own height. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollRef?: RefObject<ScrollView | null>;
}) {
  const own = useRef<ScrollView>(null);
  const ref = scrollRef ?? own;
  useDragScroll(ref, horizontal);
  return (
    <ScrollView
      ref={ref}
      horizontal={horizontal}
      style={[horizontal ? styles.horizontal : fill ? styles.vertical : styles.bounded, style]}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator
      showsHorizontalScrollIndicator
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  vertical: { flex: 1, width: '100%' },
  bounded: { width: '100%', flexGrow: 0 },
  horizontal: { width: '100%', maxWidth: '100%' },
});
