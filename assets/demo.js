/* =============================================================================
 * NIDOS · Prototipo del producto
 * -----------------------------------------------------------------------------
 * Simula el flujo posterior al registro: perfil de convivencia → matching por
 * afinidad → viviendas compatibles → formalización.
 *
 * El score de afinidad se CALCULA sobre las respuestas reales de quien navega
 * (no es un número fijo): así el prototipo muestra cómo funcionaría el motor.
 * No escribe nada en la base: es una demostración, no un instrumento de medición.
 * ========================================================================== */
(function () {
  'use strict';

  const CFG = window.NIDOS_CONFIG || {};
  const $ = s => document.querySelector(s);
  const pesos = n => '$' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n));
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TC        = CFG.TC_USD || 1400;
  const P_SUSCRIP = (CFG.PRECIO_SUSCRIPCION_USD || 15) * TC;
  const P_VISIB   = (CFG.PRECIO_VISIBILIDAD_USD || 12) * TC;
  const P_CONTRATO= (CFG.PRECIO_CONTRATO_USD || 25) * TC;
  const PCT_GAR   = CFG.GARANTIA_PCT_ANUAL || 0.06;
  const MESES_AD  = CFG.MESES_ADELANTO_SIN_GARANTIA || 6;
  const COM_GAR   = CFG.COMISION_GARANTIA_PCT != null ? CFG.COMISION_GARANTIA_PCT : 0.20;

  /* ===========================================================================
   * Dimensiones del perfil de convivencia
   * Cada opción tiene un valor numérico 0–1: la afinidad entre dos personas es
   * la cercanía en cada dimensión, ponderada por cuánto pesa en la convivencia.
   * ======================================================================== */
  const PREGUNTAS = [
    {
      clave: 'horario', peso: 1.2,
      titulo: '¿Cómo son tus horarios?',
      bajada: 'Los horarios son la fuente número uno de roces en una convivencia compartida.',
      opciones: [
        { v: 'Madrugador/a', n: 0, emoji: '🌅', desc: 'Me levanto temprano y me acuesto temprano' },
        { v: 'Flexible',     n: .5, emoji: '🕐', desc: 'Depende del día, me adapto' },
        { v: 'Nocturno/a',   n: 1, emoji: '🌙', desc: 'Rindo de noche y me levanto tarde' }
      ]
    },
    {
      clave: 'orden', peso: 1.4,
      titulo: '¿Y con el orden?',
      bajada: 'Sin acuerdo previo sobre la limpieza, la convivencia se rompe en el primer mes.',
      opciones: [
        { v: 'Muy ordenado/a', n: 0, emoji: '✨', desc: 'Necesito todo en su lugar, siempre' },
        { v: 'Ordenado/a',     n: .5, emoji: '🧽', desc: 'Prolijo, pero sin obsesión' },
        { v: 'Relajado/a',     n: 1, emoji: '🌀', desc: 'Convivo bien con cierto desorden' }
      ]
    },
    {
      clave: 'social', peso: 1.1,
      titulo: '¿Cómo usás la casa?',
      bajada: 'Si para uno la casa es punto de encuentro y para el otro es refugio, hay conflicto.',
      opciones: [
        { v: 'Refugio tranquilo', n: 0, emoji: '📚', desc: 'Casi no recibo visitas' },
        { v: 'Equilibrado',       n: .5, emoji: '🍵', desc: 'Alguna junta de vez en cuando' },
        { v: 'Punto de encuentro', n: 1, emoji: '🎉', desc: 'Me gusta tener gente en casa' }
      ]
    },
    {
      clave: 'mascotas', peso: 1.3,
      titulo: '¿Mascotas?',
      bajada: 'Es un filtro duro: define con quién y en qué propiedades podés convivir.',
      opciones: [
        { v: 'Preferiría que no haya', n: 0, emoji: '🚫', desc: 'Por alergia o preferencia' },
        { v: 'No tengo, me gustan',    n: .5, emoji: '🐾', desc: 'Sin problema si el otro tiene' },
        { v: 'Tengo mascota',          n: 1, emoji: '🐕', desc: 'Viene conmigo' }
      ]
    },
    {
      clave: 'fumar', peso: 1.2,
      titulo: '¿Se fuma en casa?',
      bajada: '',
      opciones: [
        { v: 'No fumo y prefiero que no', n: 0, emoji: '🚭', desc: 'Ni adentro ni en el balcón' },
        { v: 'No fumo, no me molesta',    n: .5, emoji: '🙂', desc: 'Si es afuera, todo bien' },
        { v: 'Fumo',                      n: 1, emoji: '🚬', desc: 'Busco un lugar donde se pueda' }
      ]
    },
    {
      clave: 'casa', peso: .8,
      titulo: '¿Cuánto tiempo pasás en casa?',
      bajada: 'Dos personas trabajando desde casa necesitan un espacio distinto que dos que salen todo el día.',
      opciones: [
        { v: 'Poco, salgo todo el día',  n: 0, emoji: '🏃', desc: 'Uso la casa para dormir' },
        { v: 'Bastante',                 n: .5, emoji: '🏠', desc: 'Algunos días en casa' },
        { v: 'Trabajo o estudio en casa', n: 1, emoji: '💻', desc: 'Necesito un espacio tranquilo de día' }
      ]
    }
  ];

  const ZONAS = ['CABA · Palermo, Villa Crespo, Colegiales', 'CABA · Caballito, Almagro, Boedo',
                 'CABA · Belgrano, Núñez, Saavedra', 'CABA · Recoleta, Retiro, San Nicolás',
                 'GBA Norte · Vicente López, San Isidro, Tigre'];

  /* --- Personas ficticias del prototipo (no son perfiles reales) ------------ */
  const CANDIDATOS = [
    { nombre: 'Sofía', edad: 26, ocupa: 'Diseñadora UX · trabaja híbrido', color: ['#6366F1', '#8B5CF6'],
      bio: 'Busco compartir un 3 ambientes en zona norte de CABA. Cocino mucho, cuido mis plantas y necesito silencio a la mañana para trabajar.',
      v: { horario: 1, orden: .5, social: .5, mascotas: .5, fumar: .5, casa: 1 } },
    { nombre: 'Mateo', edad: 24, ocupa: 'Estudiante de Ingeniería · UBA', color: ['#0EA5E9', '#22D3EE'],
      bio: 'Vengo de Mendoza a estudiar. Tengo una gata tranquila. Entreno temprano y suelo estar en la facultad todo el día.',
      v: { horario: 0, orden: 1, social: 1, mascotas: 1, fumar: 0, casa: 0 } },
    { nombre: 'Camila', edad: 29, ocupa: 'Enfermera · turnos rotativos', color: ['#F43F5E', '#FB7185'],
      bio: 'Necesito una casa ordenada y tranquila porque duermo en horarios raros. No fumo y prefiero un ambiente sin humo.',
      v: { horario: 0, orden: 0, social: 0, mascotas: 0, fumar: 0, casa: .5 } },
    { nombre: 'Tomás', edad: 27, ocupa: 'Desarrollador · remoto', color: ['#059669', '#34D399'],
      bio: 'Trabajo desde casa, así que valoro un buen escritorio y wifi. Me gusta cocinar los fines de semana con amigos.',
      v: { horario: 1, orden: .5, social: 1, mascotas: .5, fumar: .5, casa: 1 } }
  ];

  const ETIQUETAS = { horario: 'Horarios', orden: 'Orden y limpieza', social: 'Uso social de la casa',
                      mascotas: 'Mascotas', fumar: 'Humo', casa: 'Tiempo en casa' };

  /* --- Propiedades ficticias aptas para compartir --------------------------- */
  const VIVIENDAS = [
    { zona: 'Villa Crespo', calle: 'Aguirre y Julián Álvarez', amb: 3, personas: 2, total: 760000,
      color: ['#0F766E', '#14B8A6'], tag: 'Verificada',
      reglas: ['Mascotas permitidas', 'No se fuma adentro', 'Expensas incluidas'] },
    { zona: 'Caballito', calle: 'Rojas y Rivadavia', amb: 4, personas: 3, total: 1050000,
      color: ['#7C3AED', '#A78BFA'], tag: 'Verificada',
      reglas: ['Sin mascotas', 'No se fuma', 'Expensas y wifi incluidos'] },
    { zona: 'Belgrano', calle: 'Olazábal y Cabildo', amb: 3, personas: 2, total: 900000,
      color: ['#B45309', '#F59E0B'], tag: 'Nueva',
      reglas: ['Mascotas a convenir', 'Balcón para fumadores', 'Expensas aparte'] }
  ];

  /* ===========================================================================
   * Estado y motor de afinidad
   * ======================================================================== */
  const st = { i: 0, resp: {}, zona: ZONAS[0], presupuesto: 350000,
               mazo: 0, match: null, vivienda: null };

  function afinidad(cand) {
    let suma = 0, pesos_ = 0, detalle = [];
    PREGUNTAS.forEach(p => {
      const mia = st.resp[p.clave];
      if (mia === undefined) return;
      const s = 1 - Math.abs(mia - cand.v[p.clave]);   // cercanía en la dimensión
      suma += s * p.peso; pesos_ += p.peso;
      detalle.push({ dim: ETIQUETAS[p.clave], s: s });
    });
    const pct = pesos_ ? Math.round(100 * suma / pesos_) : 0;
    return { pct: pct, detalle: detalle };
  }

  const avatar = (c, extra) =>
    '<div class="davatar' + (extra || '') + '" style="background:linear-gradient(135deg,' +
    c.color[0] + ',' + c.color[1] + ')" aria-hidden="true">' + esc(c.nombre[0]) + '</div>';

  const anillo = pct =>
    '<div class="dscore"><div class="dscore__anillo" style="--darc:' + (pct * 3.6) + 'deg">' +
    '<i>' + pct + '%</i></div><span class="dscore__lbl">Afinidad</span></div>';

  /* ===========================================================================
   * Pantallas
   * ======================================================================== */
  const app = $('#dapp');

  const PANTALLAS = [
    'intro',
    ...PREGUNTAS.map((_, k) => 'preg' + k),
    'ubicacion', 'perfil', 'swipe', 'match', 'viviendas', 'formalizar', 'cierre'
  ];

  function pintar() {
    const p = PANTALLAS[st.i];
    if (p === 'intro')            app.innerHTML = vIntro();
    else if (p.startsWith('preg')) app.innerHTML = vPregunta(Number(p.slice(4)));
    else if (p === 'ubicacion')   app.innerHTML = vUbicacion();
    else if (p === 'perfil')      app.innerHTML = vPerfil();
    else if (p === 'swipe')       app.innerHTML = vSwipe();
    else if (p === 'match')       app.innerHTML = vMatch();
    else if (p === 'viviendas')   app.innerHTML = vViviendas();
    else if (p === 'formalizar')  app.innerHTML = vFormalizar();
    else if (p === 'cierre')      app.innerHTML = vCierre();

    const pct = Math.round(100 * st.i / (PANTALLAS.length - 1));
    $('#dfill').style.width = pct + '%';
    $('#dpaso').textContent = st.i === 0 ? '' : 'Paso ' + st.i + ' de ' + (PANTALLAS.length - 1);
    window.scrollTo({ top: 0, behavior: st.i === 0 ? 'auto' : 'smooth' });
    conectar();
  }

  const ir = n => { st.i = Math.max(0, Math.min(PANTALLAS.length - 1, n)); pintar(); };
  const btnAtras = '<button class="btn btn--ghost" data-atras>Atrás</button>';

  /* ------------------------------------------------------------------ intro -- */
  function vIntro() {
    const pasos = [
      ['Tu perfil de convivencia', 'Horarios, orden, mascotas y estilo de vida'],
      ['Personas compatibles', 'Te mostramos con quién tenés más afinidad'],
      ['El lugar', 'Espacios aptos para compartir, con el precio total a la vista'],
      ['El acuerdo', 'Garantía digital, contrato y pagos, todo desde acá']
    ];
    return '<section class="dpantalla dintro">' +
      '<div><p class="deyebrow">Bienvenido a Nidos</p>' +
      '<h1 class="dtitulo">Empecemos por vos:<br><span class="accent">cómo te gusta vivir.</span></h1>' +
      '<p class="dbajada">Seis preguntas rápidas sobre tu día a día. Con eso buscamos personas ' +
        'compatibles y lugares que entren en tu presupuesto, para que compartir casa sea una ' +
        'elección y no una lotería.</p>' +
      '<p class="dnota">Toma menos de dos minutos. Podés cambiar tus respuestas cuando quieras.</p>' +
      '<div class="dacciones"><button class="btn btn--primary btn--lg" data-ir="1">' +
        '<span>Armar mi perfil</span>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</button></div></div>' +
      '<div class="dmapa">' + pasos.map((x, k) =>
        '<div class="dmapa__paso' + (k === 0 ? ' dmapa__paso--hoy' : '') + '">' +
        '<span class="dmapa__n">' + (k + 1) + '</span><span><strong>' + esc(x[0]) + '</strong>' +
        '<span>' + esc(x[1]) + '</span></span></div>').join('') +
      '</div></section>';
  }

  /* -------------------------------------------------------------- preguntas -- */
  function vPregunta(k) {
    const p = PREGUNTAS[k];
    return '<section class="dpantalla dpreg"><div class="dcabecera">' +
      '<p class="deyebrow">Perfil de convivencia · ' + (k + 1) + ' de ' + PREGUNTAS.length + '</p>' +
      '<h1 class="dtitulo">' + esc(p.titulo) + '</h1>' +
      (p.bajada ? '<p class="dbajada">' + esc(p.bajada) + '</p>' : '') + '</div>' +
      '<div class="dopciones">' + p.opciones.map(o =>
        '<button class="dopcion' + (st.resp[p.clave] === o.n ? ' is-sel' : '') + '" data-op="' + o.n + '" data-clave="' + p.clave + '">' +
        '<span class="dopcion__emoji">' + o.emoji + '</span>' +
        '<span class="dopcion__txt"><strong>' + esc(o.v) + '</strong><span>' + esc(o.desc) + '</span></span>' +
        '</button>').join('') + '</div>' +
      '<div class="dacciones">' + (k > 0 ? btnAtras : '') + '</div></section>';
  }

  /* -------------------------------------------------------------- ubicación -- */
  function vUbicacion() {
    return '<section class="dpantalla dpreg"><div class="dcabecera">' +
      '<p class="deyebrow">Perfil de convivencia · zona y presupuesto</p>' +
      '<h1 class="dtitulo">¿Dónde y con cuánto?</h1>' +
      '<p class="dbajada">Es tu parte del alquiler, no el total de la propiedad. Con esto filtramos ' +
        'qué espacios tienen sentido para vos.</p></div>' +
      '<div class="dcard"><div class="campo"><label class="campo__label" for="dzona">Zona preferida</label>' +
      '<select id="dzona">' + ZONAS.map(z =>
        '<option' + (z === st.zona ? ' selected' : '') + '>' + esc(z) + '</option>').join('') + '</select></div>' +
      '<div class="campo rango" style="margin-top:22px"><label class="campo__label" for="dpres">Tu presupuesto mensual</label>' +
      '<p class="rango__valor" id="dpresval">' + pesos(st.presupuesto) + ' <span>por mes</span></p>' +
      '<input type="range" id="dpres" min="150000" max="900000" step="25000" value="' + st.presupuesto + '">' +
      '<div class="rango__escala"><span>' + pesos(150000) + '</span><span>' + pesos(900000) + ' o más</span></div>' +
      '</div></div>' +
      '<div class="dacciones">' + btnAtras +
      '<button class="btn btn--primary" data-ir="' + (st.i + 1) + '"><span>Ver mi perfil</span></button></div></section>';
  }

  /* ----------------------------------------------------------------- perfil -- */
  function vPerfil() {
    const chips = PREGUNTAS.map(p => {
      const o = p.opciones.find(x => x.n === st.resp[p.clave]);
      return o ? '<span class="dchip">' + o.emoji + ' ' + esc(o.v) + '</span>' : '';
    }).join('');
    const barras = PREGUNTAS.map(p => {
      const o = p.opciones.find(x => x.n === st.resp[p.clave]);
      return '<div class="dbarra"><div class="dbarra__top"><strong>' + esc(ETIQUETAS[p.clave]) + '</strong>' +
        '<span>' + esc(o ? o.v : '—') + '</span></div>' +
        '<div class="dbarra__riel"><div class="dbarra__val" style="width:' +
        (30 + (p.peso / 1.4) * 70) + '%"></div></div></div>';
    }).join('');
    return '<section class="dpantalla"><div class="dcabecera">' +
      '<p class="deyebrow">Tu perfil está listo</p>' +
      '<h1 class="dtitulo">Listo. Ya sabemos<br><span class="accent">con quién buscarte.</span></h1>' +
      '<p class="dbajada">Así te ve Nidos cuando busca convivientes. Cuanto más pesa una variable, ' +
        'más influye en la compatibilidad: el orden y las mascotas son las que más conflictos ' +
        'explican en una convivencia compartida.</p></div>' +
      '<div class="dperfil"><div class="dcard"><h3>Tu perfil de convivencia</h3>' +
      '<div class="dchips">' + chips + '</div>' +
      '<p class="dnota">Zona: <strong>' + esc(st.zona) + '</strong><br>Presupuesto: <strong>' +
        pesos(st.presupuesto) + '</strong> por mes</p></div>' +
      '<div class="dcard"><h3>Cuánto pesa cada variable</h3><p class="dnota" style="margin-top:4px">' +
        'En tu score de compatibilidad con otras personas.</p>' +
      '<div class="dbarras" style="margin-top:18px">' + barras + '</div></div></div>' +
      '<div class="dacciones">' + btnAtras +
      '<button class="btn btn--primary btn--lg" data-ir="' + (st.i + 1) + '">' +
        '<span>Ver personas compatibles</span></button></div></section>';
  }

  /* ------------------------------------------------------------------ swipe -- */
  function fichaHTML(c, fondo) {
    const a = afinidad(c);
    const items = a.detalle.map(d => {
      const v = d.s >= .75 ? 'si' : d.s >= .4 ? 'mas' : 'no';
      const txt = v === 'si' ? 'Coinciden' : v === 'mas' ? 'Parecido' : 'Difieren';
      return '<div class="dcoincid__item"><span class="dcoincid__ico" data-v="' + v + '">' +
        (v === 'si' ? '✓' : v === 'mas' ? '~' : '✕') + '</span>' +
        '<span><b>' + esc(d.dim) + ':</b> ' + txt + '</span></div>';
    }).join('');
    return '<article class="dficha' + (fondo ? ' dficha--fondo' : '') + '"' +
      (fondo ? '' : ' id="dficha-activa"') + '>' +
      '<div class="dficha__head">' + avatar(c) +
      '<div><div class="dficha__nombre">' + esc(c.nombre) + ', ' + c.edad + '</div>' +
      '<div class="dficha__meta">' + esc(c.ocupa) + '</div></div>' + anillo(a.pct) + '</div>' +
      '<p class="dficha__bio">' + esc(c.bio) + '</p>' +
      '<div class="dcoincid">' + items + '</div>' +
      (fondo ? '' : '<div class="dficha__pie">' +
        '<button class="dbtn-circ dbtn-circ--no" data-swipe="no">✕ Pasar</button>' +
        '<button class="dbtn-circ dbtn-circ--si" data-swipe="si">♥ Me interesa</button></div>') +
      '</article>';
  }

  function vSwipe() {
    const c = CANDIDATOS[st.mazo], sig = CANDIDATOS[st.mazo + 1];
    const mazo = c
      ? (sig ? fichaHTML(sig, true) : '') + fichaHTML(c, false)
      : '<div class="dficha dvacio"><div><p><strong>Por hoy no hay más perfiles.</strong></p>' +
        '<p class="dnota">Te avisamos en cuanto se sumen personas compatibles en tu zona.</p>' +
        '<button class="btn btn--outline" data-reset-mazo style="margin-top:16px">Ver de nuevo</button></div></div>';
    return '<section class="dpantalla"><div class="dcabecera">' +
      '<p class="deyebrow">Personas compatibles</p>' +
      '<h1 class="dtitulo">Estas personas buscan<br><span class="accent">algo parecido a vos.</span></h1>' +
      '<p class="dbajada">Están ordenadas por compatibilidad con tu perfil. Si te interesa alguien ' +
        'y a esa persona también, se abre el chat: nadie puede escribirte sin que vos lo elijas.</p></div>' +
      '<div class="dswipe"><div class="dmazo">' + mazo + '</div>' +
      '<div><div class="dcard"><h3>¿Cómo calculamos la afinidad?</h3>' +
      '<p class="dnota" style="margin-top:6px">Comparamos tus respuestas con las de la otra persona ' +
        'en las seis dimensiones de convivencia y ponderamos cada una según cuántos conflictos ' +
        'explica. No es una estimación: si cambiás una respuesta, el porcentaje cambia.</p>' +
      '<p class="dnota" style="margin-top:12px">Ninguna persona ve tus datos de contacto hasta que ' +
        'haya match. Todos los perfiles tienen identidad verificada.</p></div>' +
      '<div class="dacciones">' + btnAtras + '</div></div></div></section>';
  }

  /* ------------------------------------------------------------------ match -- */
  function vMatch() {
    const c = st.match || CANDIDATOS[0];
    const a = afinidad(c);
    const yo = { nombre: 'Vos', color: ['#0F1F3D', '#1E3A5F'] };
    return '<section class="dpantalla dmatch">' +
      '<div class="dmatch__avatares">' + avatar(yo) + avatar(c) + '</div>' +
      '<p class="deyebrow">Es match</p>' +
      '<h1 class="dtitulo">Vos y ' + esc(c.nombre) + '<br><span class="accent">se eligieron.</span></h1>' +
      '<div class="dmatch__score">' + a.pct + '%<span>de afinidad de convivencia</span></div>' +
      '<p class="dbajada" style="margin-inline:auto">Ahora se abre el chat seguro dentro de la ' +
        'plataforma: sin dar el teléfono, con identidad verificada de las dos partes.</p>' +
      '<div class="dchat">' +
      '<div class="dmsg dmsg--ella">¡Hola! Vi que buscás en la misma zona. ¿Te sirve mudarte el mes que viene?</div>' +
      '<div class="dmsg dmsg--yo">Sí, justo estoy con los tiempos. ¿Vemos los lugares que nos aparecen a los dos?</div>' +
      '<div class="dmsg dmsg--ella">Dale, hay tres que entran en los dos presupuestos 🙌</div>' +
      '</div>' +
      '<div class="dacciones" style="justify-content:center">' + btnAtras +
      '<button class="btn btn--primary btn--lg" data-ir="' + (st.i + 1) + '">' +
        '<span>Ver viviendas para los dos</span></button></div></section>';
  }

  /* -------------------------------------------------------------- viviendas -- */
  function vViviendas() {
    const c = st.match || CANDIDATOS[0];
    const lista = VIVIENDAS.map(v => {
      const pp = v.total / v.personas;
      return Object.assign({}, v, { pp: pp, dif: Math.abs(pp - st.presupuesto) });
    }).sort((a, b) => a.dif - b.dif);
    const casa = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 10.5 12 3l9 7.5M5.5 12.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return '<section class="dpantalla"><div class="dcabecera">' +
      '<p class="deyebrow">Matching habitacional</p>' +
      '<h1 class="dtitulo">Tres lugares para vos y ' + esc(c.nombre) + '</h1>' +
      '<p class="dbajada">Espacios aptos para compartir que entran en los dos presupuestos, con el ' +
        'precio total a la vista y las reglas de la casa desde el primer momento. Ninguno pide ' +
        'garantía propietaria.</p></div>' +
      '<div class="dviviendas">' + lista.map((v, k) =>
        '<button class="dviv' + (st.vivienda === k ? ' is-sel' : '') + '" data-viv="' + k + '">' +
        '<span class="dviv__foto" style="background:linear-gradient(135deg,' + v.color[0] + ',' + v.color[1] + ')">' +
        '<span class="dviv__tag">' + esc(v.tag) + '</span>' + casa + '</span>' +
        '<span class="dviv__cuerpo"><span class="dviv__zona">' + esc(v.zona) + '</span>' +
        '<span class="dviv__det">' + esc(v.calle) + ' · ' + v.amb + ' ambientes · ' + v.personas + ' personas</span>' +
        '<span class="dviv__precio">' + pesos(v.pp) + '<small>por persona, por mes</small></span>' +
        '<span class="dviv__total">Total del alquiler: ' + pesos(v.total) + '</span>' +
        '<span class="dviv__reglas">' + v.reglas.map(r => '<span>· ' + esc(r) + '</span>').join('') + '</span>' +
        '<span class="dviv__cta">Elegir este →</span></span></button>').join('') + '</div>' +
      '<p class="dnota">Elegí uno para ver las condiciones de ingreso y el acuerdo.</p>' +
      '<div class="dacciones">' + btnAtras + '</div></section>';
  }

  /* ----------------------------------------------------------- formalizar --- */
  function vFormalizar() {
    const lista = VIVIENDAS.map(v => Object.assign({}, v, { pp: v.total / v.personas,
      dif: Math.abs(v.total / v.personas - st.presupuesto) })).sort((a, b) => a.dif - b.dif);
    const v = lista[st.vivienda || 0];
    const garantia = v.pp * 12 * PCT_GAR;
    const adelanto = v.pp * MESES_AD;
    const ico = d => '<span class="dlinea__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg></span>';

    return '<section class="dpantalla"><div class="dcabecera">' +
      '<p class="deyebrow">Condiciones de ingreso</p>' +
      '<h1 class="dtitulo">De un acuerdo de palabra<br><span class="accent">a un contrato real.</span></h1>' +
      '<p class="dbajada">Elegiste ' + esc(v.zona) + ' a ' + pesos(v.pp) + ' por persona. Esto es ' +
        'todo lo que pagás para entrar, sin garantía propietaria y sin adelantar medio año.</p></div>' +
      '<div class="dform"><div class="dlineas">' +
      '<div class="dlinea">' + ico('<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0"/>') +
      '<span class="dlinea__txt"><strong>Suscripción mientras buscás</strong>' +
      '<span>Matching, mensajería sin límite, perfil verificado y acceso anticipado. Se cancela cuando encontrás.</span></span>' +
      '<span class="dlinea__monto"><b>' + pesos(P_SUSCRIP) + '</b><span>por mes</span></span></div>' +

      '<div class="dlinea dlinea--destaca">' + ico('<path d="M12 3l7.5 3v5.5c0 4.4-3 8.2-7.5 9.5-4.5-1.3-7.5-5.1-7.5-9.5V6L12 3Z"/><path d="m8.8 12 2.3 2.3 4.1-4.4"/>') +
      '<span class="dlinea__txt"><strong>Garantía digital</strong>' +
      '<span>Reemplaza al garante propietario que no tenés: es el ' + Math.round(PCT_GAR * 100) +
        '% del alquiler anual, una sola vez.</span>' +
      '<span class="dsplit"><span class="dsplit__it">Prima del asegurador de caución · <b>' +
        pesos(garantia * (1 - COM_GAR)) + '</b></span>' +
      '<span class="dsplit__it">Comisión de Nidos por intermediar · <b>' +
        pesos(garantia * COM_GAR) + '</b></span></span></span>' +
      '<span class="dlinea__monto"><b>' + pesos(garantia) + '</b><span>una vez</span></span></div>' +

      '<div class="dlinea">' + ico('<path d="M7 3.5h10l3 3.5v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"/><path d="M8.5 12h7M8.5 16h4"/>') +
      '<span class="dlinea__txt"><strong>Contrato y acuerdo de convivencia</strong>' +
      '<span>Contrato con validez legal, reglas firmadas por las dos partes, depósito y pagos trazables.</span></span>' +
      '<span class="dlinea__monto"><b>' + pesos(P_CONTRATO) + '</b><span>una vez, a dividir</span></span></div>' +

      '<div class="dlinea dlinea--otrolado">' + ico('<path d="M3 10.5 12 3l9 7.5M5.5 12.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7.5"/><path d="M9.5 21v-5h5v5"/>') +
      '<span class="dlinea__txt"><strong>Plan de visibilidad · no lo pagás vos</strong>' +
      '<span>Lo abona quien ofrece el lugar para que su publicación aparezca primero y le lleguen ' +
        'personas con identidad verificada.</span></span>' +
      '<span class="dlinea__monto"><b>' + pesos(P_VISIB) + '</b><span>por mes publicado</span></span></div>' +
      '</div>' +

      '<div class="dcompara"><h3>El costo de entrar, comparado</h3>' +
      '<div class="dcompara__fila"><span>Hoy, sin garante: ' + MESES_AD + ' meses de adelanto</span>' +
        '<b class="tachado">' + pesos(adelanto) + '</b></div>' +
      '<div class="dcompara__fila"><span>Con la garantía digital de Nidos</span>' +
        '<b class="bueno">' + pesos(garantia) + '</b></div>' +
      '<div class="dcompara__fila"><span>Lo que te queda disponible</span>' +
        '<b class="bueno">' + pesos(adelanto - garantia) + '</b></div>' +
      '<p class="dcompara__nota">Estimación sobre el alquiler que elegiste. El costo final de la ' +
        'garantía depende de tu situación y se confirma antes de firmar, pero nunca implica ' +
        'inmovilizar meses de alquiler.</p></div></div>' +
      '<div class="dacciones">' + btnAtras +
      '<button class="btn btn--primary btn--lg" data-ir="' + (st.i + 1) + '"><span>Continuar con el acuerdo</span></button>' +
      '</div></section>';
  }

  /* ----------------------------------------------------------------- cierre -- */
  function vCierre() {
    const c = st.match || CANDIDATOS[0];
    const lista = VIVIENDAS.map(v => Object.assign({}, v, { pp: v.total / v.personas,
      dif: Math.abs(v.total / v.personas - st.presupuesto) })).sort((a, b) => a.dif - b.dif);
    const v = lista[st.vivienda || 0];
    const items = [
      ['Firma digital', 'Te llega el contrato y el acuerdo de convivencia para firmar con ' + c.nombre + '. Válido legalmente.'],
      ['Garantía digital', 'La emitimos con la aseguradora una vez firmado. No necesitás garante propietario.'],
      ['Depósito y primer mes', 'Se pagan desde la plataforma, con comprobante para las dos partes.'],
      ['Coordinación de la mudanza', 'Fecha de entrada, llaves y estado del lugar documentado con fotos.'],
      ['Soporte durante todo el alquiler', 'Canal de reporte y mediación si algo de la convivencia se complica.']
    ];
    return '<section class="dpantalla dcierre">' +
      '<div class="dcierre__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4.5 4.5L19 7"/></svg></div>' +
      '<h1 class="dtitulo">Tu solicitud está<br><span class="accent">en marcha.</span></h1>' +
      '<p class="dbajada" style="margin-inline:auto">Reservamos ' + esc(v.zona) + ' para vos y ' +
        esc(c.nombre) + ' por 48 horas mientras se completa el acuerdo. Esto es lo que sigue:</p>' +
      '<div class="dresumen">' + items.map(x =>
        '<div class="dresumen__it"><span class="dresumen__ok">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4.5 4.5L19 7"/></svg></span>' +
        '<span><b>' + esc(x[0]) + ':</b> ' + esc(x[1]) + '</span></div>').join('') + '</div>' +
      '<div class="dacciones" style="justify-content:center">' +
      '<a class="btn btn--primary btn--lg" href="index.html"><span>Volver al inicio</span></a>' +
      '<button class="btn btn--outline" data-ir="0">Recorrer de nuevo</button></div>' +
      '</section>';
  }

  /* ===========================================================================
   * Eventos
   * ======================================================================== */
  function conectar() {
    app.querySelectorAll('[data-ir]').forEach(b =>
      b.addEventListener('click', () => ir(Number(b.dataset.ir))));
    app.querySelectorAll('[data-atras]').forEach(b =>
      b.addEventListener('click', () => ir(st.i - 1)));

    // opción de una pregunta: guarda y avanza
    app.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => {
      st.resp[b.dataset.clave] = Number(b.dataset.op);
      b.classList.add('is-sel');
      setTimeout(() => ir(st.i + 1), 170);
    }));

    const zona = app.querySelector('#dzona');
    if (zona) zona.addEventListener('change', () => { st.zona = zona.value; });

    const pres = app.querySelector('#dpres');
    if (pres) pres.addEventListener('input', () => {
      st.presupuesto = Number(pres.value);
      app.querySelector('#dpresval').innerHTML = pesos(st.presupuesto) + ' <span>por mes</span>';
    });

    // swipe con botones y con arrastre
    app.querySelectorAll('[data-swipe]').forEach(b =>
      b.addEventListener('click', () => resolverSwipe(b.dataset.swipe === 'si')));
    const ficha = app.querySelector('#dficha-activa');
    if (ficha) arrastrar(ficha);

    const reset = app.querySelector('[data-reset-mazo]');
    if (reset) reset.addEventListener('click', () => { st.mazo = 0; pintar(); });

    app.querySelectorAll('[data-viv]').forEach(b => b.addEventListener('click', () => {
      st.vivienda = Number(b.dataset.viv);
      b.classList.add('is-sel');
      setTimeout(() => ir(st.i + 1), 180);
    }));
  }

  function resolverSwipe(quiere) {
    const ficha = app.querySelector('#dficha-activa');
    const c = CANDIDATOS[st.mazo];
    if (ficha) ficha.classList.add(quiere ? 'dficha--fuera-der' : 'dficha--fuera-izq');
    setTimeout(() => {
      if (quiere) { st.match = c; ir(st.i + 1); }
      else { st.mazo += 1; pintar(); }
    }, 260);
  }

  /* Arrastre horizontal de la ficha: gesto natural, decide al soltar. */
  function arrastrar(el) {
    let x0 = null;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      x0 = e.clientX; el.setPointerCapture(e.pointerId); el.style.transition = 'none';
    });
    el.addEventListener('pointermove', e => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      el.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx / 22) + 'deg)';
    });
    const soltar = e => {
      if (x0 === null) return;
      const dx = e.clientX - x0; x0 = null;
      el.style.transition = ''; el.style.transform = '';
      if (Math.abs(dx) > 110) resolverSwipe(dx > 0);
    };
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', () => { x0 = null; el.style.transition = ''; el.style.transform = ''; });
  }

  $('#dreiniciar').addEventListener('click', () => {
    st.i = 0; st.resp = {}; st.mazo = 0; st.match = null; st.vivienda = null;
    st.presupuesto = 350000; st.zona = ZONAS[0];
    history.replaceState(null, '', location.pathname);
    pintar();
  });

  /* Deep link a una pantalla: ?p=swipe · ?p=formalizar · ?p=4 ...
     Útil para mostrar una pantalla puntual sin recorrer todo el flujo. Si no
     hay respuestas cargadas, usa un perfil de ejemplo para que tenga sentido. */
  (function inicio() {
    const p = new URLSearchParams(location.search).get('p');
    if (!p) return pintar();

    const idx = /^\d+$/.test(p) ? Number(p) : PANTALLAS.indexOf(p);
    if (idx < 1) return pintar();

    if (!Object.keys(st.resp).length) {
      // perfil de ejemplo: nocturno, ordenado, tranquilo, sin mascota, sin humo, en casa
      const ejemplo = { horario: 1, orden: .5, social: 0, mascotas: .5, fumar: 0, casa: 1 };
      PREGUNTAS.forEach(q => { st.resp[q.clave] = ejemplo[q.clave]; });
      st.presupuesto = 450000;
      st.match = CANDIDATOS[0];
      st.vivienda = 0;
    }
    ir(idx);
  })();
})();
