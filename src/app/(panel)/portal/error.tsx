"use client";

import { ErrorSeccion } from "@/components/panel/error-seccion";

export default function ErrorPanel(props: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return <ErrorSeccion {...props} inicio="/portal" />;
}
