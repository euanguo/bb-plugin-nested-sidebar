import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { loadIcon } from "@hugeicons/core-free-icons/loader";
import { cn } from "@/lib/utils";
import {
  canonicalGroupIcon,
  normalizeGroupIconName,
  type GroupIconName,
} from "@/lib/group-icons";

/**
 * Renders any free Hugeicons export without putting the complete icon set in
 * the main bundle. The loader creates one small chunk per icon; group rows
 * therefore keep the normal sidebar bundle small while the picker can expose
 * the entire library.
 */
export function GroupIcon({
  name,
  className,
  ariaHidden,
  ariaLabel,
  defer = false,
}: {
  name: GroupIconName;
  className?: string;
  ariaHidden?: boolean | "true" | "false";
  ariaLabel?: string;
  defer?: boolean;
}) {
  const canonical = canonicalGroupIcon(name);
  return defer ? (
    <DeferredGroupIcon
      name={canonical}
      className={className}
      ariaHidden={ariaHidden}
      ariaLabel={ariaLabel}
    />
  ) : (
    <ResolvedGroupIcon
      name={canonical}
      className={className}
      ariaHidden={ariaHidden}
      ariaLabel={ariaLabel}
    />
  );
}

function DeferredGroupIcon(props: {
  name: string;
  className?: string;
  ariaHidden?: boolean | "true" | "false";
  ariaLabel?: string;
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const target = ref.current;
    if (target === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={ref} className={cn("inline-flex shrink-0", props.className)}>
      {visible ? <ResolvedGroupIcon {...props} /> : null}
    </span>
  );
}

function ResolvedGroupIcon({
  name,
  className,
  ariaHidden,
  ariaLabel,
}: {
  name: string;
  className?: string;
  ariaHidden?: boolean | "true" | "false";
  ariaLabel?: string;
}) {
  const [icon, setIcon] = useState<IconSvgElement | null>(null);
  const [failed, setFailed] = useState(false);
  const resolvedName = normalizeGroupIconName(name);

  useEffect(() => {
    let current = true;
    setIcon(null);
    setFailed(false);
    if (resolvedName === null) return () => undefined;
    void loadIcon(resolvedName).then(
      (loaded) => {
        if (current) setIcon(loaded);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [resolvedName]);

  if (icon === null || failed) {
    return <span aria-hidden className={cn("inline-block", className)} />;
  }
  return (
    <HugeiconsIcon
      icon={icon}
      className={className}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      data-icon={name}
    />
  );
}
