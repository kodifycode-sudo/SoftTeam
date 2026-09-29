"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function BotonImprimir() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer data-icon="inline-start" /> Imprimir o guardar PDF
    </Button>
  );
}
