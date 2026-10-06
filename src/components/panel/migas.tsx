"use client";

import Link from "next/link";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/** Un paso de las migas; el último (la página actual) va sin enlace. */
export interface Miga {
  texto: string;
  href?: string;
}

/** Migas de pan para volver a las páginas de arriba (listado, ficha del cliente…). */
export function MigasDePan({ migas }: { migas: readonly Miga[] }) {
  return (
    <Breadcrumb className="print:hidden">
      <BreadcrumbList className="text-xs sm:text-sm">
        {migas.map((miga, i) => (
          <Fragment key={`${miga.texto}-${miga.href ?? ""}`}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className="min-w-0">
              {miga.href ? (
                <BreadcrumbLink render={<Link href={miga.href} />} className="truncate">
                  {miga.texto}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="max-w-[24ch] truncate sm:max-w-[40ch]">
                  {miga.texto}
                </BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
