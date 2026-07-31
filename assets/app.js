/* =============================================================================
 * NIDOS · Lógica de la landing de validación
 * -----------------------------------------------------------------------------
 * Sin dependencias ni build. Escribe en Supabase por REST (append-only) y,
 * si no hay credenciales configuradas, cae a "modo demo" en localStorage.
 * ========================================================================== */
(function () {
  'use strict';

  const CFG = window.NIDOS_CONFIG || {};
  const VARIANT = window.NIDOS_VARIANT || 'A';
  /* En localhost SIEMPRE modo demo: las pruebas locales no deben escribir en
     la base de producción ni inflar las métricas de la campaña. */
  const ES_LOCAL = ['localhost', '127.0.0.1'].indexOf(location.hostname) !== -1;
  const HAY_SUPABASE = Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) && !ES_LOCAL;

  const $  = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  const pesos = n => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n));

  /* ===========================================================================
   * Sesión y atribución
   * ======================================================================== */
  const SESSION_ID = (function () {
    try {
      let s = sessionStorage.getItem('nidos_sid');
      if (!s) {
        s = 'sid_' + Date.now().toString(36) + '_' +
            Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('nidos_sid', s);
      }
      return s;
    } catch (e) {
      return 'sid_' + Math.random().toString(36).slice(2, 12);
    }
  })();

  const qs = new URLSearchParams(location.search);
  const ATRIBUCION = {
    utm_source:   qs.get('utm_source'),
    utm_medium:   qs.get('utm_medium'),
    utm_campaign: qs.get('utm_campaign'),
    referrer:     document.referrer || null,
    user_agent:   navigator.userAgent
  };

  /* --- Referidos -------------------------------------------------------------
   * MI_REF es el código que esta persona comparte (el tramo aleatorio de su
   * session_id, así el par se reconstruye en SQL sin columnas nuevas).
   * REF_ENTRANTE es el código de quien la invitó: viaja por ?ref=... y se
   * recuerda en localStorage por si convierte en otra visita. */
  const MI_REF = SESSION_ID.split('_')[2] || SESSION_ID.replace(/[^a-z0-9]/gi, '').slice(-8);
  const REF_ENTRANTE = (function () {
    let r = (qs.get('ref') || '').replace(/[^a-z0-9]/gi, '').slice(0, 16) || null;
    try {
      if (r) localStorage.setItem('nidos_ref', r);
      else r = localStorage.getItem('nidos_ref');
    } catch (e) {}
    return r && r !== MI_REF ? r : null;
  })();

  /* ===========================================================================
   * Persistencia
   * ======================================================================== */
  const almacenLocal = {
    leer(clave) {
      try { return JSON.parse(localStorage.getItem(clave) || '[]'); }
      catch (e) { return []; }
    },
    agregar(clave, fila) {
      try {
        const datos = this.leer(clave);
        datos.push(fila);
        localStorage.setItem(clave, JSON.stringify(datos.slice(-500)));
      } catch (e) { /* cuota llena: seguimos sin bloquear al usuario */ }
    }
  };

  /* Inserta en Supabase. Nunca lanza: si falla, deja la fila guardada localmente
     para que no se pierda ningún dato y la experiencia no se corte. */
  async function insertar(tabla, filas) {
    const lote = Array.isArray(filas) ? filas : [filas];
    if (!lote.length) return { ok: true, local: true };

    almacenLocal.agregar('nidos_' + tabla, { at: new Date().toISOString(), filas: lote });
    if (!HAY_SUPABASE) return { ok: true, local: true };

    try {
      const res = await fetch(
        CFG.SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/' + tabla,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': CFG.SUPABASE_ANON_KEY,
            'Authorization': 'Bearer ' + CFG.SUPABASE_ANON_KEY,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(lote),
          keepalive: true
        }
      );
      if (!res.ok) {
        console.warn('[nidos] Supabase respondió ' + res.status, await res.text());
        return { ok: false };
      }
      return { ok: true };
    } catch (err) {
      console.warn('[nidos] no se pudo escribir en Supabase', err);
      return { ok: false };
    }
  }

  /* ===========================================================================
   * Telemetría
   * ======================================================================== */
  function track(nombre, props) {
    insertar('eventos', {
      session_id: SESSION_ID,
      variant: VARIANT,
      nombre: nombre,
      props: props || {}
    });
    if (window.clarity) { try { window.clarity('event', nombre); } catch (e) {} }
    if (window.gtag)    { try { window.gtag('event', nombre, props || {}); } catch (e) {} }
    if (window.fbq && nombre === 'lead_capturado') { try { window.fbq('track', 'Lead'); } catch (e) {} }
  }

  /* Telemetría de errores: si algo se rompe en un navegador que no probamos,
     el mensaje exacto queda en eventos (nombre = 'error_js') para diagnosticar
     desde los datos en vez de adivinar. */
  let erroresReportados = 0;
  function reportarError(mensaje, extra) {
    if (erroresReportados >= 5) return;
    erroresReportados += 1;
    insertar('eventos', {
      session_id: SESSION_ID,
      variant: VARIANT,
      nombre: 'error_js',
      props: Object.assign({
        mensaje: String(mensaje || 'desconocido').slice(0, 300),
        pagina: location.pathname + location.search,
        navegador: navigator.userAgent.slice(0, 160)
      }, extra || {})
    });
  }
  window.addEventListener('error', e =>
    reportarError(e.message, { origen: (e.filename || '').split('/').pop() + ':' + e.lineno }));
  window.addEventListener('unhandledrejection', e =>
    reportarError((e.reason && e.reason.message) || 'promesa rechazada', { tipo: 'promesa' }));

  function cargarAnalytics() {
    if (CFG.CLARITY_ID) {
      (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1;
        t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
      })(window, document, 'clarity', 'script', CFG.CLARITY_ID);
    }
    if (CFG.GA4_ID) {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + CFG.GA4_ID;
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', CFG.GA4_ID);
    }
    if (CFG.META_PIXEL_ID) {
      (function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = true; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      window.fbq('init', CFG.META_PIXEL_ID);
      window.fbq('track', 'PageView');
    }
  }

  /* ===========================================================================
   * Estado del formulario
   * ======================================================================== */
  const estado = {
    puerta: 'busco',
    nombre: '',
    email: '',
    paso: 0,
    respuestas: {},   // clave -> { valor, valor_num, paso }
    terminado: false
  };

  /* ===========================================================================
   * Catálogos de opciones
   * ======================================================================== */
  const ZONAS = [
    'CABA · Palermo, Villa Crespo, Colegiales',
    'CABA · Recoleta, Retiro, San Nicolás',
    'CABA · Caballito, Almagro, Boedo',
    'CABA · Belgrano, Núñez, Saavedra',
    'CABA · Microcentro, San Telmo, Monserrat',
    'CABA · Flores, Caballito sur, Parque Chacabuco',
    'CABA · otro barrio',
    'GBA Norte · Vicente López, San Isidro, Tigre',
    'GBA Oeste · Morón, Ramos Mejía, Haedo',
    'GBA Sur · Avellaneda, Lomas, Quilmes',
    'Gran Córdoba',
    'Gran Rosario',
    'Gran Mendoza',
    'Otra ciudad del país',
    'Todavía no lo tengo definido'
  ];

  const ESCALA_WTP = [
    { v: 'Sí, lo pagaría sin dudar',            d: 'Me resuelve un problema que hoy no puedo resolver' },
    { v: 'Lo pagaría si funciona bien',         d: 'Necesitaría ver que la plataforma es seria antes' },
    { v: 'Me parece caro, lo pensaría',         d: 'Me interesa, pero el precio me hace dudar' },
    { v: 'No lo pagaría',                      d: 'Preferiría seguir resolviéndolo por mi cuenta' }
  ];

  /* La garantía digital la paga el inquilino, no el oferente (Doc #3). Para el
     oferente no se puede preguntar disposición a pagar por algo que no paga:
     lo que se mide es cuánto pesa en su decisión de usar la plataforma. */
  const ESCALA_VALOR = [
    { v: 'Decisivo, sin eso no comparto',  d: 'Es la condición que me faltaba para animarme' },
    { v: 'Suma bastante',                  d: 'Me daría bastante más tranquilidad' },
    { v: 'Suma un poco',                   d: 'Ayuda, pero no es lo que define' },
    { v: 'No me cambia nada',              d: 'Mi decisión no pasa por ahí' }
  ];

  /* ===========================================================================
   * Definición de los pasos
   * Cada paso: { clave, titulo, bajada, tipo, opciones, render, validar }
   * ======================================================================== */
  function pasosBusco() {
    return [
      {
        titulo: '¿Dónde estás viviendo hoy?',
        bajada: 'Nos ayuda a entender de dónde venís y qué necesitás resolver.',
        campos: [{
          clave: 'situacion', tipo: 'radio', requerido: true,
          opciones: [
            { v: 'Con mis padres o mi familia', d: 'Todavía no me pude independizar' },
            { v: 'Alquilo solo/a y me cuesta sostenerlo' },
            { v: 'Ya comparto con otras personas', d: 'Y busco cambiar de lugar o de convivientes' },
            { v: 'Vivo en pareja y estoy por separarme' },
            { v: 'Me estoy mudando a la ciudad', d: 'Por estudio o por trabajo' },
            { v: 'Otra situación' }
          ]
        }]
      },
      {
        titulo: '¿Dónde querés vivir y con cuánto contás?',
        bajada: 'El presupuesto es tu parte del alquiler mensual, no el total de la propiedad.',
        campos: [
          { clave: 'zona', tipo: 'select', requerido: true,
            label: '¿En qué zona buscás?', placeholder: 'Elegí una zona',
            opciones: ZONAS.map(z => ({ v: z })) },
          { clave: 'presupuesto', tipo: 'rango', requerido: true,
            label: '¿Cuánto podés pagar por mes?',
            hint: 'Incluí expensas y servicios',
            min: 150000, max: 900000, paso: 25000, defecto: 350000 }
        ]
      },
      {
        titulo: '¿Para cuándo lo necesitás?',
        bajada: 'La urgencia nos dice a quién tenemos que atender primero.',
        campos: [{
          clave: 'urgencia', tipo: 'radio', requerido: true,
          opciones: [
            { v: 'Ya, lo necesito este mes', d: 'Es urgente' },
            { v: 'En los próximos 3 meses' },
            { v: 'En 3 a 6 meses' },
            { v: 'Todavía estoy averiguando', d: 'Sin fecha definida' }
          ]
        }]
      },
      {
        titulo: '¿Qué es lo que más te frena hoy?',
        bajada: 'Elegí lo que más pesa en tu caso. Esta es la respuesta que más nos importa.',
        campos: [{
          clave: 'barrera', tipo: 'radio', requerido: true,
          opciones: [
            { v: 'No tengo garantía propietaria ni quién me avale' },
            { v: 'No puedo adelantar meses de alquiler ni el depósito' },
            { v: 'Con mi ingreso no me alcanza para alquilar solo/a' },
            { v: 'Mis ingresos no están en blanco', d: 'Freelance, monotributo o trabajo informal' },
            { v: 'Me da miedo convivir con alguien que no conozco' },
            { v: 'No encuentro nada confiable, todo es un caos' },
            { v: 'No quiero vivir solo/a, me pesa la soledad' }
          ]
        }]
      },
      { tipo: 'wtp_busco', titulo: '¿Pagarías por esto?',
        bajada: 'Sé honesto: un "no" nos sirve tanto como un "sí". Todavía no existe nada que pagar.' },
      {
        titulo: 'Última pregunta.',
        bajada: 'Lo que escribas acá es lo que más nos ayuda a construir bien.',
        campos: [
          { clave: 'comentario', tipo: 'texto', requerido: false,
            label: '¿Qué es lo más frustrante de buscar dónde vivir hoy?',
            hint: 'Opcional, pero se lee todo',
            placeholder: 'Contanos tu experiencia...' },
          { clave: 'nombre', tipo: 'input', requerido: false,
            label: '¿Cómo te llamás?',
            hint: 'Opcional',
            placeholder: 'Tu nombre' },
          { clave: 'whatsapp', tipo: 'tel', requerido: false,
            label: '¿Te avisamos por WhatsApp cuando abramos?',
            hint: 'Opcional. Solo para avisarte, nada más.',
            placeholder: '11 5555 5555' }
        ]
      }
    ];
  }

  function pasosTengoLugar() {
    return [
      {
        titulo: '¿Cuál es tu caso?',
        bajada: 'Cada situación necesita cosas distintas de la plataforma.',
        campos: [{
          clave: 'situacion', tipo: 'radio', requerido: true,
          opciones: [
            { v: 'Alquilo y quiero sumar a alguien', d: 'Para que las cuentas me cierren' },
            { v: 'Soy dueño/a y tengo una habitación libre', d: 'Vivo en la propiedad' },
            { v: 'Tengo una propiedad que quiero poner a compartir', d: 'No vivo ahí' },
            { v: 'Vivo solo/a en un lugar grande', d: 'Mis hijos se fueron o quedé solo/a' },
            { v: 'Trabajo en el rubro inmobiliario' },
            { v: 'Otra situación' }
          ]
        }]
      },
      {
        titulo: '¿Dónde queda y cuánto pedirías?',
        bajada: 'El monto es por persona, por mes.',
        campos: [
          { clave: 'zona', tipo: 'select', requerido: true,
            label: '¿En qué zona está el lugar?', placeholder: 'Elegí una zona',
            opciones: ZONAS.map(z => ({ v: z })) },
          { clave: 'presupuesto', tipo: 'rango', requerido: true,
            label: '¿Cuánto pedirías por mes?',
            hint: 'Por persona, incluyendo expensas y servicios',
            min: 150000, max: 900000, paso: 25000, defecto: 350000 }
        ]
      },
      {
        titulo: '¿Cuándo estaría disponible?',
        campos: [{
          clave: 'urgencia', tipo: 'radio', requerido: true,
          opciones: [
            { v: 'Ya está disponible' },
            { v: 'En los próximos 3 meses' },
            { v: 'En 3 a 6 meses' },
            { v: 'Todavía lo estoy pensando' }
          ]
        }]
      },
      {
        titulo: '¿Qué te frena de compartir?',
        bajada: 'Elegí lo que más pesa. Esta es la respuesta que más nos importa.',
        campos: [{
          clave: 'barrera', tipo: 'radio', requerido: true,
          opciones: [
            { v: 'Miedo a que la persona no pague' },
            { v: 'Miedo a convivir con alguien incompatible' },
            { v: 'No sé cómo formalizarlo legalmente' },
            { v: 'No quiero lidiar con la búsqueda ni las visitas' },
            { v: 'Miedo a que después no se quiera ir' },
            { v: 'Miedo a que dañe la propiedad' },
            { v: 'Nada me frena, ya lo estoy intentando' }
          ]
        }]
      },
      { tipo: 'wtp_oferta', titulo: '¿Pagarías por esto?',
        bajada: 'Sé honesto: un "no" nos sirve tanto como un "sí". Todavía no existe nada que pagar.' },
      {
        titulo: 'Última pregunta.',
        campos: [
          { clave: 'comentario', tipo: 'texto', requerido: false,
            label: '¿Qué te haría confiar en una plataforma para compartir tu casa?',
            hint: 'Opcional, pero se lee todo',
            placeholder: 'Contanos qué necesitarías...' },
          { clave: 'nombre', tipo: 'input', requerido: false,
            label: '¿Cómo te llamás?',
            hint: 'Opcional',
            placeholder: 'Tu nombre' },
          { clave: 'whatsapp', tipo: 'tel', requerido: false,
            label: '¿Te avisamos por WhatsApp cuando abramos?',
            hint: 'Opcional. Solo para avisarte, nada más.',
            placeholder: '11 5555 5555' }
        ]
      }
    ];
  }

  let PASOS = pasosBusco();

  /* ===========================================================================
   * Render de campos
   * ======================================================================== */
  function escapar(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderCampo(campo) {
    const guardado = estado.respuestas[campo.clave];

    if (campo.tipo === 'radio') {
      return '<div class="opts" role="radiogroup" aria-label="' + escapar(campo.label || 'Opciones') + '">' +
        campo.opciones.map((o, i) => {
          const marcado = guardado ? guardado.valor === o.v : false;
          return '<label class="opt">' +
            '<input type="radio" name="' + campo.clave + '" value="' + escapar(o.v) + '"' +
              (marcado ? ' checked' : '') + '>' +
            '<span class="opt__box"><span class="opt__text">' +
              '<span class="opt__title">' + escapar(o.v) + '</span>' +
              (o.d ? '<span class="opt__desc">' + escapar(o.d) + '</span>' : '') +
            '</span></span></label>';
        }).join('') + '</div>';
    }

    if (campo.tipo === 'select') {
      return '<div class="campo"><label class="campo__label" for="c-' + campo.clave + '">' +
        escapar(campo.label) + '</label>' +
        '<select id="c-' + campo.clave + '" name="' + campo.clave + '">' +
        '<option value="">' + escapar(campo.placeholder || 'Elegí una opción') + '</option>' +
        campo.opciones.map(o =>
          '<option value="' + escapar(o.v) + '"' +
          (guardado && guardado.valor === o.v ? ' selected' : '') + '>' +
          escapar(o.v) + '</option>').join('') +
        '</select></div>';
    }

    if (campo.tipo === 'rango') {
      const valor = guardado && guardado.valor_num ? guardado.valor_num : campo.defecto;
      return '<div class="campo"><label class="campo__label" for="c-' + campo.clave + '">' +
        escapar(campo.label) +
        (campo.hint ? ' <span class="campo__hint">· ' + escapar(campo.hint) + '</span>' : '') +
        '</label><div class="rango">' +
        '<p class="rango__valor" id="v-' + campo.clave + '">' + pesos(valor) +
          ' <span>por mes</span></p>' +
        '<input type="range" id="c-' + campo.clave + '" name="' + campo.clave + '"' +
          ' min="' + campo.min + '" max="' + campo.max + '" step="' + campo.paso + '"' +
          ' value="' + valor + '" aria-describedby="v-' + campo.clave + '">' +
        '<div class="rango__escala"><span>' + pesos(campo.min) + '</span>' +
          '<span>' + pesos(campo.max) + ' o más</span></div>' +
        '</div></div>';
    }

    if (campo.tipo === 'texto') {
      return '<div class="campo"><label class="campo__label" for="c-' + campo.clave + '">' +
        escapar(campo.label) +
        (campo.hint ? ' <span class="campo__hint">· ' + escapar(campo.hint) + '</span>' : '') +
        '</label><textarea id="c-' + campo.clave + '" name="' + campo.clave + '"' +
        ' placeholder="' + escapar(campo.placeholder || '') + '">' +
        escapar(guardado ? guardado.valor || '' : '') + '</textarea></div>';
    }

    if (campo.tipo === 'input') {
      return '<div class="campo"><label class="campo__label" for="c-' + campo.clave + '">' +
        escapar(campo.label) +
        (campo.hint ? ' <span class="campo__hint">· ' + escapar(campo.hint) + '</span>' : '') +
        '</label><input type="text" id="c-' + campo.clave + '" name="' + campo.clave + '"' +
        ' placeholder="' + escapar(campo.placeholder || '') + '"' +
        ' autocomplete="given-name"' +
        ' value="' + escapar(guardado ? guardado.valor || '' : '') + '"></div>';
    }

    if (campo.tipo === 'tel') {
      return '<div class="campo"><label class="campo__label" for="c-' + campo.clave + '">' +
        escapar(campo.label) +
        (campo.hint ? ' <span class="campo__hint">· ' + escapar(campo.hint) + '</span>' : '') +
        '</label><input type="tel" id="c-' + campo.clave + '" name="' + campo.clave + '"' +
        ' placeholder="' + escapar(campo.placeholder || '') + '"' +
        ' value="' + escapar(guardado ? guardado.valor || '' : '') + '"></div>';
    }

    return '';
  }

  /* --- Paso de disposición a pagar: precios calculados sobre lo que declaró -- */
  function bloqueWtp(clave, titulo, htmlPrecio, escala) {
    const guardado = estado.respuestas[clave];
    return '<div class="wtp-bloque"><h3>' + titulo + '</h3>' + htmlPrecio +
      '<div class="opts" role="radiogroup">' +
      (escala || ESCALA_WTP).map(o =>
        '<label class="opt"><input type="radio" name="' + clave + '" value="' + escapar(o.v) + '"' +
        (guardado && guardado.valor === o.v ? ' checked' : '') + '>' +
        '<span class="opt__box"><span class="opt__text">' +
        '<span class="opt__title">' + escapar(o.v) + '</span>' +
        '<span class="opt__desc">' + escapar(o.d) + '</span>' +
        '</span></span></label>').join('') +
      '</div></div>';
  }

  function renderWtpBusco() {
    const alquiler  = (estado.respuestas.presupuesto && estado.respuestas.presupuesto.valor_num) || 350000;
    const suscrip   = CFG.PRECIO_SUSCRIPCION_USD * CFG.TC_USD;
    const garantia  = alquiler * 12 * CFG.GARANTIA_PCT_ANUAL;
    const adelanto  = alquiler * CFG.MESES_ADELANTO_SIN_GARANTIA;
    const contrato  = CFG.PRECIO_CONTRATO_USD * CFG.TC_USD;

    return bloqueWtp('wtp_suscripcion',
      'Acceso completo a la plataforma mientras buscás',
      '<div class="precio"><p class="precio__monto">' + pesos(suscrip) +
        ' <small>por mes, mientras buscás</small></p>' +
      '<p class="precio__detalle">Matching por afinidad, mensajería sin límite, ' +
        'perfil verificado y acceso anticipado a los lugares nuevos. ' +
        'Se cancela cuando encontrás.</p></div>'
    ) + bloqueWtp('wtp_garantia',
      'Garantía digital en lugar de garante propietario',
      '<div class="precio precio--destacado"><p class="precio__monto">' + pesos(garantia) +
        ' <small>una sola vez</small></p>' +
      '<p class="precio__detalle">Es el 6% del alquiler anual. Reemplaza al garante ' +
        'propietario que hoy no tenés. La alternativa actual es adelantar ' +
        '<strong>' + pesos(adelanto) + '</strong> (seis meses) para poder entrar.</p></div>'
    ) + bloqueWtp('wtp_contrato',
      'Contrato y acuerdo de convivencia gestionado',
      '<div class="precio"><p class="precio__monto">' + pesos(contrato) +
        ' <small>una vez, a dividir entre las partes</small></p>' +
      '<p class="precio__detalle">Contrato con validez legal, reglas de convivencia ' +
        'firmadas, gestión del depósito y pagos trazables.</p></div>'
    );
  }

  function renderWtpOferta() {
    const visib    = CFG.PRECIO_VISIBILIDAD_USD * CFG.TC_USD;
    const contrato = CFG.PRECIO_CONTRATO_USD * CFG.TC_USD;

    /* Los dos flujos que paga el oferente según el Doc #3: plan de visibilidad
       y su mitad del contrato. La garantía la paga el inquilino, así que ahí se
       mide valor percibido, no disposición a pagar. */
    return bloqueWtp('wtp_visibilidad',
      'Publicación destacada y acceso a buscadores verificados',
      '<div class="precio"><p class="precio__monto">' + pesos(visib) +
        ' <small>por mes de publicación</small></p>' +
      '<p class="precio__detalle">Tu lugar aparece primero, llegan solo personas con ' +
        'identidad verificada y ves métricas de quién se interesó.</p></div>'
    ) + bloqueWtp('wtp_contrato',
      'Contrato y acuerdo de convivencia gestionado',
      '<div class="precio"><p class="precio__monto">' + pesos(contrato / 2) +
        ' <small>una vez, tu mitad del contrato</small></p>' +
      '<p class="precio__detalle">Contrato con validez legal, reglas de convivencia ' +
        'firmadas y respaldo si hay que mediar en un conflicto. El costo total es ' +
        pesos(contrato) + ' y se divide entre las partes.</p></div>'
    ) + bloqueWtp('valor_garantia',
      'La persona entra con garantía digital de Nidos',
      '<div class="precio precio--destacado"><p class="precio__monto">Sin costo para vos</p>' +
      '<p class="precio__detalle">Quien entra a vivir contrata la garantía, que te respalda ' +
        'si deja de pagar. No lo pagás vos. ¿Cuánto pesa esto en tu decisión de ' +
        'compartir tu lugar?</p></div>',
      ESCALA_VALOR
    );
  }

  /* ===========================================================================
   * Motor del cuestionario
   * ======================================================================== */
  const modal    = $('#modal');
  const cuerpo   = $('#modal-body');
  const pie      = $('#modal-foot');
  const btnNext  = $('#btn-next');
  const btnBack  = $('#btn-back');
  const barra    = $('#progress-fill');
  const contador = $('#modal-step');
  let ultimoFoco = null;

  function pintarPaso() {
    const i = estado.paso;
    const paso = PASOS[i];
    if (!paso) return;

    let html = '<div class="paso-head"><h2 id="paso-titulo">' + escapar(paso.titulo) + '</h2>' +
      (paso.bajada ? '<p>' + escapar(paso.bajada) + '</p>' : '') + '</div>';

    if (paso.tipo === 'wtp_busco')       html += renderWtpBusco();
    else if (paso.tipo === 'wtp_oferta') html += renderWtpOferta();
    else html += paso.campos.map(renderCampo).join('');

    cuerpo.innerHTML = html;
    cuerpo.scrollTop = 0;

    // El slider actualiza su etiqueta en vivo
    $$('input[type="range"]', cuerpo).forEach(inp => {
      inp.addEventListener('input', () => {
        const salida = $('#v-' + inp.name, cuerpo);
        if (salida) salida.innerHTML = pesos(inp.value) + ' <span>por mes</span>';
      });
    });

    // En los pasos de una sola pregunta, elegir una opción avanza solo
    const esUnicaPregunta = paso.campos && paso.campos.length === 1 && paso.campos[0].tipo === 'radio';
    if (esUnicaPregunta) {
      $$('input[type="radio"]', cuerpo).forEach(inp => {
        inp.addEventListener('change', () => setTimeout(avanzar, 190));
      });
    }

    contador.textContent = 'Paso ' + (i + 1) + ' de ' + PASOS.length;
    const pct = Math.round((i / PASOS.length) * 100);
    barra.style.width = pct + '%';
    barra.parentElement.setAttribute('aria-valuenow', String(pct));

    btnBack.hidden = i === 0;
    $('span', btnNext).textContent = i === PASOS.length - 1 ? 'Terminar' : 'Siguiente';
    pie.classList.remove('is-hidden');

    track('step_view', { paso: i + 1, titulo: paso.titulo, puerta: estado.puerta });

    const primero = $('input, select, textarea', cuerpo);
    if (primero && primero.type !== 'range') {
      try { primero.focus({ preventScroll: true }); } catch (e) {}
    }
  }

  /* Lee el paso actual y devuelve las filas a guardar, o null si falta algo. */
  function recolectar() {
    const paso = PASOS[estado.paso];
    const filas = [];
    const faltantes = [];

    /* El paso de precios no declara campos: sus claves dependen de la puerta,
       porque cada lado paga flujos distintos del modelo. */
    const clavesWtp = estado.puerta === 'tengo_lugar'
      ? ['wtp_visibilidad', 'wtp_contrato', 'valor_garantia']
      : ['wtp_suscripcion', 'wtp_garantia', 'wtp_contrato'];

    const claves = paso.campos
      ? paso.campos.map(c => ({ clave: c.clave, requerido: c.requerido, tipo: c.tipo }))
      : clavesWtp.map(k => ({ clave: k, requerido: true, tipo: 'radio' }));

    claves.forEach(c => {
      let valor = null, num = null;

      if (c.tipo === 'radio') {
        const sel = $('input[name="' + c.clave + '"]:checked', cuerpo);
        valor = sel ? sel.value : null;
      } else if (c.tipo === 'rango') {
        const inp = $('input[name="' + c.clave + '"]', cuerpo);
        if (inp) { num = Number(inp.value); valor = pesos(num); }
      } else {
        const inp = $('[name="' + c.clave + '"]', cuerpo);
        valor = inp && inp.value.trim() ? inp.value.trim() : null;
      }

      if (c.requerido && !valor && num === null) { faltantes.push(c.clave); return; }
      if (!valor && num === null) return;

      estado.respuestas[c.clave] = { valor: valor, valor_num: num, paso: estado.paso + 1 };
      filas.push({
        session_id: SESSION_ID,
        paso: estado.paso + 1,
        clave: c.clave,
        valor: valor,
        valor_num: num
      });
    });

    if (faltantes.length) {
      avisar(faltantes.length > 1
        ? 'Te faltan algunas respuestas de este paso'
        : 'Elegí una opción para seguir');
      const primerFaltante = $('[name="' + faltantes[0] + '"]', cuerpo);
      if (primerFaltante) {
        const caja = primerFaltante.closest('.wtp-bloque, .campo, .opts');
        if (caja) caja.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return null;
    }
    return filas;
  }

  /* Pantalla de cierre mínima: si terminar() o pintarPaso() fallan en algún
     navegador, la persona igual recibe confirmación (sus respuestas ya se
     guardaron paso a paso) en lugar de un modal en blanco. */
  function graciasMinima() {
    estado.terminado = true;
    barra.style.width = '100%';
    contador.textContent = 'Listo';
    pie.classList.add('is-hidden');
    cuerpo.innerHTML =
      '<div class="gracias">' +
        '<h2 id="paso-titulo">Listo. Ya estás en la lista.</h2>' +
        '<p>Guardamos tus respuestas y te vamos a escribir a <strong>' +
          escapar(estado.email || 'tu email') + '</strong> cuando abramos. ¡Gracias por sumarte!</p>' +
        '<div class="gracias__acciones">' +
          '<button class="btn btn--primary btn--block" data-close-modal>Volver a la página</button>' +
        '</div>' +
      '</div>';
  }

  async function avanzar() {
    const filas = recolectar();
    if (!filas) return;

    btnNext.disabled = true;
    insertar('respuestas', filas);
    track('step_complete', { paso: estado.paso + 1, puerta: estado.puerta });

    try {
      if (estado.paso === PASOS.length - 1) {
        await terminar();
      } else {
        estado.paso += 1;
        pintarPaso();
      }
    } catch (err) {
      reportarError('fallo al avanzar: ' + (err && err.message), { paso: estado.paso + 1 });
      graciasMinima();
    }
    btnNext.disabled = false;
  }

  function retroceder() {
    if (estado.paso === 0) return;
    estado.paso -= 1;
    pintarPaso();
  }

  async function terminar() {
    estado.terminado = true;
    track('onboarding_completo', { puerta: estado.puerta });

    barra.style.width = '100%';
    barra.parentElement.setAttribute('aria-valuenow', '100');
    contador.textContent = 'Listo';
    pie.classList.add('is-hidden');

    const posicion = CFG.WAITLIST_OFFSET > 0
      ? '<div class="gracias__pos"><strong>#' +
          (CFG.WAITLIST_OFFSET + 1) + '</strong>' +
          '<span>Tu lugar en la lista de espera</span></div>'
      : '';

    const r = estado.respuestas;
    const resumen = [
      r.zona && r.zona.valor,
      r.presupuesto && r.presupuesto.valor,
      r.urgencia && r.urgencia.valor
    ].filter(Boolean).join(' · ');

    cuerpo.innerHTML =
      '<div class="gracias">' +
        '<div class="gracias__icon" aria-hidden="true">' +
          '<svg viewBox="0 0 40 36">' +
            '<path d="M4 15.5 20 3l16 12.5M7.5 18.5V31a2 2 0 0 0 2 2h21a2 2 0 0 0 2-2V18.5" ' +
              'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
            '<path d="M20 27.5c-4.6-3-6.4-5.2-6.4-7.6a3.4 3.4 0 0 1 6.4-1.7 3.4 3.4 0 0 1 6.4 1.7c0 2.4-1.8 4.6-6.4 7.6z" ' +
              'fill="currentColor"/>' +
          '</svg>' +
        '</div>' +
        '<h2 id="paso-titulo">' + (function () {
          const n = (estado.respuestas.nombre && estado.respuestas.nombre.valor) || estado.nombre || '';
          return n ? 'Listo, ' + escapar(n.split(' ')[0]) + '. Ya estás en la lista.'
                   : 'Listo. Ya estás en la lista.';
        })() + '</h2>' +
        '<p>Te vamos a escribir a <strong>' + escapar(estado.email) + '</strong> en cuanto ' +
          'abramos las primeras zonas. Mientras tanto, tus respuestas nos dicen qué ' +
          'construir primero.</p>' +
        posicion +
        (resumen ? '<p class="gracias__resumen" style="margin-top:20px;font-size:14.5px;color:#8494A8">' +
          escapar(resumen) + '</p>' : '') +
        '<div class="gracias__ref">' +
          '<h3>¿Buscás con alguien? Entren juntos.</h3>' +
          '<p>Los pares que se anotan juntos tienen prioridad cuando abre su zona: ' +
             'ya resolvieron lo más difícil, que es <strong>con quién</strong> convivir.</p>' +
          '<div class="ref-link">' +
            '<span id="ref-url"></span>' +
            '<button type="button" class="ref-link__btn" id="btn-copiar-ref">Copiar</button>' +
          '</div>' +
        '</div>' +
        '<div class="gracias__acciones">' +
          '<a class="btn btn--primary btn--block" id="btn-wsp" target="_blank" rel="noopener">' +
            '<span>Invitar por WhatsApp</span></a>' +
          '<button class="btn btn--outline btn--block" data-close-modal>Volver a la página</button>' +
        '</div>' +
      '</div>';

    // Link personal de invitación: reconstruye el par en los datos
    const urlRef = location.origin + location.pathname + '?ref=' + MI_REF;
    $('#ref-url').textContent = urlRef.replace(/^https?:\/\//, '');

    $('#btn-copiar-ref').addEventListener('click', async () => {
      track('click_compartir', { canal: 'copiar' });
      try {
        await navigator.clipboard.writeText(urlRef);
        avisar('Link copiado. Pasáselo a quien quieras.');
      } catch (e) {
        avisar(urlRef); // si el portapapeles falla, al menos lo muestra
      }
    });

    const wsp = $('#btn-wsp');
    wsp.href = 'https://wa.me/?text=' + encodeURIComponent(
      'Me anoté en la lista de espera de Nidos, una plataforma para conseguir ' +
      'vivienda compartida sin garantía propietaria. Si te anotás con mi link, ' +
      'quedamos juntos en la lista: ' + urlRef
    );
    wsp.addEventListener('click', () => track('click_compartir', { canal: 'whatsapp' }));
  }

  /* ===========================================================================
   * Modal
   * ======================================================================== */
  function abrirModal() {
    ultimoFoco = document.activeElement;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('modal-abierta');
    pintarPaso();
  }

  function cerrarModal() {
    if (!estado.terminado) {
      track('onboarding_abandonado', { paso: estado.paso + 1, puerta: estado.puerta });
    }
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.body.classList.remove('modal-abierta');
    if (ultimoFoco) { try { ultimoFoco.focus(); } catch (e) {} }
  }

  // Mantiene el foco dentro del modal mientras está abierto
  document.addEventListener('keydown', e => {
    if (modal.hidden) return;
    if (e.key === 'Escape') { cerrarModal(); return; }
    if (e.key !== 'Tab') return;

    const focables = $$('button, [href], input, select, textarea', modal)
      .filter(el => !el.disabled && el.offsetParent !== null);
    if (!focables.length) return;
    const primero = focables[0], ultimo = focables[focables.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  });

  $$('[data-close-modal]').forEach(el => el.addEventListener('click', cerrarModal));
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('[data-close-modal]')) cerrarModal();
  });
  btnNext.addEventListener('click', avanzar);
  btnBack.addEventListener('click', retroceder);

  /* ===========================================================================
   * Formulario del hero
   * ======================================================================== */
  const formHero = $('#form-hero');
  const errorHero = $('#hero-error');

  // Quien llega con un link de invitación lo ve reflejado en el formulario
  if (REF_ENTRANTE) {
    const aviso = document.createElement('p');
    aviso.className = 'ref-banner';
    aviso.innerHTML = 'Venís con una invitación: si te sumás, quedan ' +
      '<strong>juntos en la lista</strong>.';
    formHero.insertBefore(aviso, formHero.firstChild);
    try {
      if (!sessionStorage.getItem('nidos_ref_visto')) {
        sessionStorage.setItem('nidos_ref_visto', '1');
        track('landing_referida', { ref: REF_ENTRANTE });
      }
    } catch (e) {}
  }

  function mostrarError(msg, campo) {
    errorHero.textContent = msg;
    errorHero.hidden = false;
    if (campo) { campo.setAttribute('aria-invalid', 'true'); campo.focus(); }
  }

  function limpiarError() {
    errorHero.hidden = true;
    $$('#form-hero input, #form-hero select').forEach(i => i.removeAttribute('aria-invalid'));
  }

  /* La ciudad del hero pre-carga la zona del paso 2 del onboarding, para que
     nadie sienta que responde dos veces lo mismo. AMBA no se mapea: ahí el
     onboarding pregunta el barrio, que es el dato fino que necesitamos. */
  const CIUDAD_A_ZONA = {
    'Gran Córdoba': 'Gran Córdoba',
    'Gran Rosario': 'Gran Rosario',
    'Gran Mendoza': 'Gran Mendoza',
    'Otra ciudad de Argentina': 'Otra ciudad del país',
    'Todavía no lo sé': 'Todavía no lo tengo definido'
  };

  formHero.addEventListener('submit', async e => {
    e.preventDefault();
    limpiarError();

    const ciudad = $('#zona-ciudad').value;
    const email  = $('#email').value.trim();
    const puerta = $('input[name="puerta"]:checked').value;

    if (!ciudad) {
      $('#zona-ciudad').setAttribute('aria-invalid', 'true');
      return mostrarError('Contanos dónde te gustaría vivir', $('#zona-ciudad'));
    }
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) {
      return mostrarError('Revisá el email, parece que tiene un error', $('#email'));
    }

    estado.nombre = '';
    estado.email = email;
    estado.puerta = puerta;
    estado.paso = 0;
    estado.respuestas = {};
    estado.terminado = false;
    if (CIUDAD_A_ZONA[ciudad]) {
      estado.respuestas.zona = { valor: CIUDAD_A_ZONA[ciudad], valor_num: null, paso: 2 };
    }
    PASOS = puerta === 'tengo_lugar' ? pasosTengoLugar() : pasosBusco();

    const boton = $('button[type="submit"]', formHero);
    boton.disabled = true;
    $('span', boton).textContent = 'Un segundo...';

    await insertar('leads', Object.assign({
      session_id: SESSION_ID,
      nombre: null,   // se pide (opcional) en el último paso del onboarding
      email: email,
      puerta: puerta,
      variant: VARIANT
    }, ATRIBUCION));

    /* La ciudad se guarda como respuesta (paso 0) para que quede registrada
       aunque la persona abandone el onboarding: es el dato que valida en qué
       orden abrir las zonas. */
    insertar('respuestas', {
      session_id: SESSION_ID,
      paso: 0,
      clave: 'zona_ciudad',
      valor: ciudad,
      valor_num: null
    });

    track('lead_capturado', Object.assign(
      { puerta: puerta, ciudad: ciudad },
      REF_ENTRANTE ? { ref: REF_ENTRANTE } : {}
    ));

    boton.disabled = false;
    $('span', boton).textContent = 'Reservar mi lugar';
    abrirModal();
  });

  /* ===========================================================================
   * Detalles de la página
   * ======================================================================== */
  function avisar(mensaje) {
    const toast = $('#toast');
    toast.textContent = mensaje;
    toast.hidden = false;
    clearTimeout(avisar._t);
    avisar._t = setTimeout(() => { toast.hidden = true; }, 3200);
  }

  // Botones que llevan al formulario
  $$('[data-scroll-to]').forEach(btn => {
    btn.addEventListener('click', () => {
      const destino = $('#' + btn.dataset.scrollTo);
      if (!destino) return;
      track('click_cta', { desde: btn.textContent.trim().slice(0, 40) });
      destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => { try { $('#email').focus({ preventScroll: true }); } catch (e) {} }, 520);
    });
  });

  // Sombra de la barra al scrollear
  const nav = $('#nav');
  const alScrollear = () => nav.classList.toggle('is-stuck', window.scrollY > 8);
  window.addEventListener('scroll', alScrollear, { passive: true });
  alScrollear();

  // Email de contacto: se arma en JS para no dejarlo crudo ante los bots
  $$('[data-email]').forEach(a => {
    const dir = CFG.EMAIL_CONTACTO || 'hola@nidos.com.ar';
    a.textContent = dir;
    a.href = 'mailto:' + dir;
  });

  // Un solo <details> abierto a la vez en el FAQ
  const qas = $$('.qa');
  qas.forEach(qa => qa.addEventListener('toggle', () => {
    if (qa.open) qas.forEach(otro => { if (otro !== qa) otro.open = false; });
  }));

  // Registra hasta dónde llegó a leer, para saber qué secciones importan
  if ('IntersectionObserver' in window) {
    const vistas = new Set();
    const obs = new IntersectionObserver(entradas => {
      entradas.forEach(en => {
        if (en.isIntersecting && en.target.id && !vistas.has(en.target.id)) {
          vistas.add(en.target.id);
          track('seccion_vista', { seccion: en.target.id });
        }
      });
    }, { threshold: .4 });
    ['problema', 'como-funciona', 'comparativa', 'faq'].forEach(id => {
      const el = $('#' + id);
      if (el) obs.observe(el);
    });
  }

  /* ===========================================================================
   * Detalles visuales: aparición al scroll, números animados y CTA sticky
   * ======================================================================== */
  const sinMovimiento = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Aparición progresiva de las tarjetas al entrar en pantalla
  if ('IntersectionObserver' in window && !sinMovimiento) {
    const revelables = $$('.pilar, .dato, .quote, .paso, .garantia, .tabla-scroll, .qa');
    const obsReveal = new IntersectionObserver(entradas => {
      entradas.forEach(en => {
        if (!en.isIntersecting) return;
        en.target.classList.add('is-in');
        obsReveal.unobserve(en.target);
      });
    }, { threshold: .15, rootMargin: '0px 0px -40px' });

    revelables.forEach(el => {
      el.classList.add('reveal');
      // Escalona a los hermanos dentro de una misma grilla
      const idx = Array.prototype.indexOf.call(el.parentElement.children, el);
      el.style.transitionDelay = Math.min(Math.max(idx, 0) * 70, 280) + 'ms';
      obsReveal.observe(el);
    });

    // Las filas de la comparativa aparecen una por una
    $$('.tabla tbody tr').forEach((tr, i) => {
      tr.classList.add('reveal-fila');
      tr.style.transitionDelay = (i * 80) + 'ms';
      obsReveal.observe(tr);
    });
  }

  /* Calculadora de garantía: los dos montos se recalculan con el alquiler
     que declara la persona, igual que en el paso de precios del onboarding. */
  const gAlquiler = $('#g-alquiler');
  if (gAlquiler) {
    const gValor = $('#g-valor'), gHoy = $('#g-hoy'), gNidos = $('#g-nidos');
    const meses = CFG.MESES_ADELANTO_SIN_GARANTIA || 6;
    const pct = CFG.GARANTIA_PCT_ANUAL || 0.06;
    let gTrackeado = false;

    const actualizarGarantia = () => {
      const v = Number(gAlquiler.value);
      gValor.innerHTML = pesos(v) + ' <span>por mes</span>';
      gHoy.textContent = pesos(v * meses);
      gNidos.textContent = '~' + pesos(Math.round(v * 12 * pct));
    };

    gAlquiler.addEventListener('input', () => {
      actualizarGarantia();
      if (!gTrackeado) { gTrackeado = true; track('uso_calculadora_garantia'); }
    });
    actualizarGarantia();
  }

  // Los números del problema cuentan hacia arriba cuando aparecen
  function animarNumero(el) {
    const nodo = el.firstChild;
    if (!nodo || nodo.nodeType !== 3) return;
    const m = nodo.textContent.trim().match(/^([^0-9]*)(\d+)$/);
    if (!m) return;
    const prefijo = m[1], objetivo = parseInt(m[2], 10);
    const inicio = performance.now(), dur = 900;
    (function tick(t) {
      const p = Math.min((t - inicio) / dur, 1);
      const suave = 1 - Math.pow(1 - p, 3);
      nodo.textContent = prefijo + Math.round(objetivo * suave);
      if (p < 1) requestAnimationFrame(tick);
    })(inicio);
  }

  if ('IntersectionObserver' in window && !sinMovimiento) {
    const obsNums = new IntersectionObserver(entradas => {
      entradas.forEach(en => {
        if (!en.isIntersecting) return;
        animarNumero(en.target);
        obsNums.unobserve(en.target);
      });
    }, { threshold: .6 });
    $$('.dato__num').forEach(el => obsNums.observe(el));
  }

  // CTA fija abajo en mobile cuando el formulario del hero salió de pantalla
  const stickyCta = $('#sticky-cta');
  if (stickyCta && 'IntersectionObserver' in window) {
    const obsSticky = new IntersectionObserver(entradas => {
      entradas.forEach(en => {
        stickyCta.classList.toggle('is-on', !en.isIntersecting);
      });
    }, { threshold: 0 });
    obsSticky.observe(formHero);
  }

  /* Ctrl+Shift+D descarga todo lo capturado localmente como CSV.
     Es la red de seguridad del modo demo y de cualquier envío que haya
     fallado contra Supabase. */
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd')) return;
    e.preventDefault();

    const leads = almacenLocal.leer('nidos_leads');
    const resp  = almacenLocal.leer('nidos_respuestas');

    const porSesion = {};
    leads.forEach(l => l.filas.forEach(f => {
      porSesion[f.session_id] = Object.assign({}, f);
    }));
    resp.forEach(l => l.filas.forEach(f => {
      if (!porSesion[f.session_id]) porSesion[f.session_id] = { session_id: f.session_id };
      porSesion[f.session_id][f.clave] = f.valor_num !== null && f.valor_num !== undefined
        ? f.valor_num : f.valor;
    }));

    const filas = Object.values(porSesion);
    if (!filas.length) return avisar('Todavía no hay datos capturados en este navegador');

    const cols = filas.reduce((acc, f) => {
      Object.keys(f).forEach(k => { if (!acc.includes(k)) acc.push(k); });
      return acc;
    }, []);
    const csv = [cols.join(',')].concat(filas.map(f =>
      cols.map(c => {
        const v = f[c] === null || f[c] === undefined ? '' : String(f[c]);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(',')
    )).join('\n');

    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nidos-leads-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    avisar('Descargando ' + filas.length + ' registro' + (filas.length === 1 ? '' : 's'));
  });

  /* ===========================================================================
   * Arranque
   * ======================================================================== */
  cargarAnalytics();
  track('page_view', {
    variant: VARIANT,
    utm_source: ATRIBUCION.utm_source,
    utm_campaign: ATRIBUCION.utm_campaign,
    ref: REF_ENTRANTE || undefined,
    ancho: window.innerWidth
  });

  if (!HAY_SUPABASE) {
    console.info(
      '%c[nidos] Modo demo%c\n' +
      'No hay credenciales de Supabase en assets/config.js, así que los datos se ' +
      'guardan solo en este navegador.\nCtrl+Shift+D descarga lo capturado como CSV.',
      'background:#16A34A;color:#fff;padding:2px 8px;border-radius:4px;font-weight:600',
      'color:#52627A'
    );
  }

  // Avisa si alguien abandona el cuestionario cerrando la pestaña
  window.addEventListener('pagehide', () => {
    if (!modal.hidden && !estado.terminado) {
      track('onboarding_abandonado', { paso: estado.paso + 1, motivo: 'cierra_pestaña' });
    }
  });
})();
