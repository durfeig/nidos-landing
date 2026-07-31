/* =============================================================================
 * NIDOS · Configuración
 * -----------------------------------------------------------------------------
 * Lo único que necesitás editar para que la landing capture datos de verdad
 * son las dos primeras líneas de SUPABASE.
 * ========================================================================== */

window.NIDOS_CONFIG = {

  /* ---------------------------------------------------------------------------
   * 1. SUPABASE  (obligatorio para capturar leads)
   * Settings → API en tu proyecto. La anon key es pública y va acá sin riesgo:
   * el esquema SQL solo le permite INSERT, no puede leer nada.
   * Si las dejás vacías, la landing funciona igual en "modo demo": guarda todo
   * en el navegador y podés bajar un CSV con Ctrl+Shift+D.
   * ------------------------------------------------------------------------ */
  SUPABASE_URL: 'https://lhccxddwazmcyjpggrzj.supabase.co', 
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoY2N4ZGR3YXptY3lqcGdncnpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwODM2MzIsImV4cCI6MjEwMDY1OTYzMn0.WcEFTN3Hj1h-wOobUbvEFpMgaHhmAVx4sAma1COjECE',

  /* ---------------------------------------------------------------------------
   * 2. TEST A/B del mensaje del hero
   * 'auto'  → 50/50 estable por visitante (guardado en localStorage)
   * 'A'     → fuerza el eje compañía (mockup original)
   * 'B'     → fuerza el eje acceso (conclusión del Módulo 4)
   * También podés forzarlo por URL para revisar: ?v=A  o  ?v=B
   * ------------------------------------------------------------------------ */
  AB_MODE: 'auto',

  /* ---------------------------------------------------------------------------
   * 3. SUPUESTOS ECONÓMICOS  (Doc #3 · actualizalos si cambia el tipo de cambio)
   * Se usan para calcular en vivo los precios que ve cada persona según el
   * presupuesto que declara, en lugar de mostrar un número abstracto.
   * ------------------------------------------------------------------------ */
  TC_USD: 1400,                    // ARS por USD (Doc #3, abril 2026)
  PRECIO_SUSCRIPCION_USD: 15,      // suscripción mensual del buscador
  PRECIO_VISIBILIDAD_USD: 12,      // plan de visibilidad del oferente
  PRECIO_CONTRATO_USD: 25,         // contrato digital, flat
  GARANTIA_PCT_ANUAL: 0.06,        // garantía digital: 6% del alquiler anual
  MESES_ADELANTO_SIN_GARANTIA: 6,  // lo que hoy piden sin garantía propietaria

  /* De ese 6% que paga el inquilino, qué proporción queda para Nidos como
   * comisión de intermediación. El resto es la prima del proveedor de seguros
   * de caución. Supuesto a validar negociando con proveedores: emitir el seguro
   * en cabeza propia requiere licencia de la SSN.
   * Con 0.20, Nidos retiene el 20% de la prima y el 80% es costo pass-through. */
  COMISION_GARANTIA_PCT: 0.20,

  /* ---------------------------------------------------------------------------
   * 4. ANALÍTICA  (opcional · dejá vacío lo que no uses)
   * ------------------------------------------------------------------------ */
  CLARITY_ID: 'xt34c5j6y7',      // Microsoft Clarity → Settings → Project ID
  GA4_ID: 'G-G7FTNMSYYS',          // ej: 'G-XXXXXXXXXX'
  META_PIXEL_ID: '',   // ej: '1234567890'

  /* ---------------------------------------------------------------------------
   * 5. CONTACTO
   * ------------------------------------------------------------------------ */
  EMAIL_CONTACTO: 'durfeig@udesa.edu.ar',

  /* ---------------------------------------------------------------------------
   * 6. CONTADOR DE LISTA DE ESPERA
   * Número desde el que arranca la posición que se le muestra a cada persona.
   * Dejalo en 0 para mostrar el conteo real y crudo. No inventes prueba social:
   * si la campaña recién arranca, un número honesto es más creíble que uno alto.
   * ------------------------------------------------------------------------ */
  WAITLIST_OFFSET: 0
};
