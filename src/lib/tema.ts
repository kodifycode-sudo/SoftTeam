/** Preferencia de tema del usuario; "sistema" sigue al sistema operativo. */
export type Tema = "claro" | "oscuro" | "sistema";

/** Clave de `localStorage` donde se guarda la preferencia (sin clave = "sistema"). */
export const CLAVE_TEMA = "tema";

/**
 * Script que corre en el `<head>` antes del primer pintado: pone la clase
 * `dark` en `<html>` según la preferencia guardada, así no hay parpadeo.
 * Tiene que coincidir con `aplicarTema` de `@/components/tema`.
 */
export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem("${CLAVE_TEMA}");var o=t==="oscuro"||(t!=="claro"&&matchMedia("(prefers-color-scheme: dark)").matches);var d=document.documentElement;d.classList.toggle("dark",o);d.style.colorScheme=o?"dark":"light"}catch(e){}})()`;
