import { EsqueletoEncabezado, EsqueletoTabla } from "@/components/panel/esqueletos";

export default function Cargando() {
  return (
    <>
      <EsqueletoEncabezado acciones={false} />
      <EsqueletoTabla filas={4} columnas={5} />
    </>
  );
}
