/* =============================================================================
 * NIDOS · Prototipo del producto
 * -----------------------------------------------------------------------------
 * Simula el flujo posterior al registro: perfil de convivencia → matching por
 * afinidad con quien ya vive en la casa y ofrece una habitación → la habitación
 * verificada → formalización.
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
  const usd = n => 'USD ' + new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n / TC));
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Modelo vigente, fase 1: nunca se cobra por buscar; se cobra al cierre. */
  const TC        = CFG.TC_USD || 1560;
  const P_PACK    = (CFG.PRECIO_PACK_USD || 100) * TC;
  const P_PAGOS   = (CFG.PRECIO_PAGOS_USD || 4) * TC;
  const PCT_FEE   = CFG.SUCCESS_FEE_PCT || 0.10;
  const MESES_AD  = CFG.MESES_ADELANTO_SIN_GARANTIA || 6;

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

  /* --- Personas ficticias del prototipo (no son perfiles reales) ------------
   * Cada una ya vive en su casa y ofrece una habitación libre: el que busca no
   * sale a alquilar un lugar nuevo con otro, entra a un hogar que ya existe.
   * hab.b es el índice del barrio dentro de la zona elegida (así la habitación
   * siempre cae en la zona que marcó quien navega). */
  const CANDIDATOS = [
    { nombre: 'Sofía', edad: 26, ocupa: 'Diseñadora UX · trabaja híbrido', color: ['#6366F1', '#8B5CF6'],
      bio: 'Vivo en un 3 ambientes y se liberó la otra habitación. Cocino mucho, cuido mis plantas y necesito silencio a la mañana para trabajar.',
      v: { horario: 1, orden: .5, social: .5, mascotas: .5, fumar: .5, casa: 1 },
      /* Habitación tipo de la presentación: USD 250 por mes ($390.000 al TC 1.560) */
      hab: { b: 1, amb: 3, precio: 390000,
             fotos: ['sofia-hab', 'sofia-living', 'sofia-cocina'], color: ['#0F766E', '#14B8A6'], tag: 'Verificada',
             det: 'Habitación propia con placard · baño compartido · balcón',
             reglas: ['Mascotas a convenir', 'No se fuma adentro', 'Expensas y wifi incluidos'] } },
    { nombre: 'Mateo', edad: 24, ocupa: 'Estudiante de Ingeniería · UBA', color: ['#0EA5E9', '#22D3EE'],
      bio: 'Vine de Mendoza a estudiar y alquilo un 2 ambientes con una gata tranquila. Entreno temprano y estoy en la facultad todo el día.',
      v: { horario: 0, orden: 1, social: 1, mascotas: 1, fumar: 0, casa: 0 },
      hab: { b: 0, amb: 2, precio: 380000, fotos: ['mateo-hab'], color: ['#7C3AED', '#A78BFA'], tag: 'Verificada',
             det: 'Habitación propia · baño compartido',
             reglas: ['Hay una gata en casa', 'Balcón para fumar', 'Expensas aparte'] } },
    { nombre: 'Camila', edad: 29, ocupa: 'Enfermera · turnos rotativos', color: ['#F43F5E', '#FB7185'],
      bio: 'Tengo una habitación libre en mi casa. Necesito orden y tranquilidad porque duermo en horarios raros, y prefiero un ambiente sin humo.',
      v: { horario: 0, orden: 0, social: 0, mascotas: 0, fumar: 0, casa: .5 },
      hab: { b: 2, amb: 3, precio: 360000, fotos: ['camila-hab'], color: ['#B45309', '#F59E0B'], tag: 'Nueva',
             det: 'Habitación propia · baño compartido · patio',
             reglas: ['Sin mascotas', 'No se fuma', 'Silencio después de las 23'] } },
    { nombre: 'Tomás', edad: 27, ocupa: 'Desarrollador · remoto', color: ['#059669', '#34D399'],
      bio: 'Trabajo desde casa y busco a alguien para la segunda habitación. Valoro un buen escritorio y wifi, y cocino los fines de semana con amigos.',
      v: { horario: 1, orden: .5, social: 1, mascotas: .5, fumar: .5, casa: 1 },
      hab: { b: 0, amb: 3, precio: 400000, fotos: ['tomas-hab'], color: ['#1D4ED8', '#60A5FA'], tag: 'Verificada',
             det: 'Habitación propia con escritorio · baño compartido',
             reglas: ['Mascotas permitidas', 'No se fuma adentro', 'Expensas incluidas'] } }
  ];

  const ETIQUETAS = { horario: 'Horarios', orden: 'Orden y limpieza', social: 'Uso social de la casa',
                      mascotas: 'Mascotas', fumar: 'Humo', casa: 'Tiempo en casa' };

  /* Barrio de la habitación: uno de los barrios de la zona elegida. */
  const barrio = c => {
    const lista = st.zona.split('·').pop().split(',').map(s => s.trim());
    return lista[c.hab.b % lista.length];
  };

  /* ===========================================================================
   * Estado y motor de afinidad
   * ======================================================================== */
  const st = { i: 0, resp: {}, zona: ZONAS[0], presupuesto: 400000, match: null };

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
    'ubicacion', 'perfil', 'swipe', 'match', 'formalizar', 'cierre'
  ];

  function pintar() {
    const p = PANTALLAS[st.i];
    if (p === 'intro')            app.innerHTML = vIntro();
    else if (p.startsWith('preg')) app.innerHTML = vPregunta(Number(p.slice(4)));
    else if (p === 'ubicacion')   app.innerHTML = vUbicacion();
    else if (p === 'perfil')      app.innerHTML = vPerfil();
    else if (p === 'swipe')       app.innerHTML = vSwipe();
    else if (p === 'match')       app.innerHTML = vMatch();
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
      ['Personas compatibles', 'Quienes tienen una habitación libre y viven parecido a vos'],
      ['La habitación', 'En una casa que ya existe, con el precio y las reglas a la vista'],
      ['La mudanza', 'Acuerdo por escrito y depósito custodiado. Pagás solo si te mudás']
    ];
    return '<section class="dpantalla dintro">' +
      '<div><p class="deyebrow">Bienvenido a Nidos</p>' +
      '<h1 class="dtitulo">Empecemos por vos:<br><span class="accent">cómo te gusta vivir.</span></h1>' +
      '<p class="dbajada">Seis preguntas rápidas sobre tu día a día. Con eso buscamos personas ' +
        'compatibles que tienen una habitación libre en tu presupuesto, para que compartir casa ' +
        'sea una elección y no una lotería.</p>' +
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
      '<p class="dbajada">Es lo que podés pagar por tu habitación, por mes. Con esto filtramos ' +
        'qué habitaciones tienen sentido para vos.</p></div>' +
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

  /* ------------------------------------------------------ lista por afinidad -- */
  const FOTO = n => 'assets/casas/' + n + '.jpg';
  const AFIN_BAJA = 50;   // por debajo de este score la ficha se marca "afinidad baja"

  /* Candidatos ordenados de mayor a menor afinidad con quien navega. */
  const ordenados = () => CANDIDATOS.map(c => ({ c: c, a: afinidad(c) }))
    .sort((x, y) => y.a.pct - x.a.pct);

  function coincidencias(a) {
    return '<div class="dpers__chips">' + a.detalle.map(d => {
      const v = d.s >= .75 ? 'si' : d.s >= .4 ? 'mas' : 'no';
      return '<span class="dpers__chip" data-v="' + v + '"><i>' +
        (v === 'si' ? '✓' : v === 'mas' ? '~' : '✕') + '</i>' + esc(d.dim) + '</span>';
    }).join('') + '</div>';
  }

  function persHTML(x, k) {
    const c = x.c, a = x.a, h = c.hab, baja = a.pct < AFIN_BAJA;
    const entra = h.precio <= st.presupuesto;
    const rango = k === 0 ? 'Mejor afinidad' : baja ? 'Afinidad baja' : '#' + (k + 1) + ' en afinidad';
    return '<article class="dpers' + (k === 0 ? ' dpers--top' : '') + (baja ? ' dpers--baja' : '') + '">' +
      '<div class="dpers__foto" style="background-image:url(' + FOTO(h.fotos[0]) + ')">' +
        '<span class="dpers__rango">' + rango + '</span>' +
        '<span class="dpers__precio">' + pesos(h.precio) + '<small> por mes</small></span></div>' +
      '<div class="dpers__cuerpo">' +
        '<div class="dficha__head">' + avatar(c) +
        '<div><div class="dficha__nombre">' + esc(c.nombre) + ', ' + c.edad + '</div>' +
        '<div class="dficha__meta">' + esc(c.ocupa) + '</div></div>' + anillo(a.pct) + '</div>' +
        '<p class="dpers__hab">🏠 Habitación en <b>' + esc(barrio(c)) + '</b> · ' + h.amb + ' ambientes · ' +
          (entra ? 'entra en tu presupuesto' : 'se pasa de tu presupuesto') + '</p>' +
        '<p class="dficha__bio">' + esc(c.bio) + '</p>' +
        coincidencias(a) +
        '<button class="btn ' + (baja ? 'btn--outline' : 'btn--primary') + ' dpers__cta" data-quiero="' +
          CANDIDATOS.indexOf(c) + '"><span>♥ Me interesa</span></button>' +
      '</div></article>';
  }

  function vSwipe() {
    return '<section class="dpantalla"><div class="dcabecera">' +
      '<p class="deyebrow">Personas compatibles · ordenadas por afinidad</p>' +
      '<h1 class="dtitulo">Tienen una habitación libre<br><span class="accent">y viven parecido a vos.</span></h1>' +
      '<p class="dbajada">Cada una ya vive en su casa y busca con quién compartirla. Arriba, quien ' +
        'más se parece a tu forma de vivir. Si te interesa y esa persona también te eligió, se abre el chat.</p>' +
      '<details class="dcomo"><summary>¿Cómo calculamos la afinidad?</summary>' +
        '<p>Comparamos tus respuestas con las de cada persona en las seis dimensiones de convivencia y ' +
        'ponderamos cada una según cuántos conflictos explica. Si cambiás una respuesta, el orden cambia. ' +
        'Nadie ve tus datos de contacto hasta que haya match, y todos los perfiles tienen identidad verificada.</p>' +
      '</details></div>' +
      '<div class="dlista">' + ordenados().map(persHTML).join('') + '</div>' +
      '<div class="dacciones">' + btnAtras + '</div></section>';
  }

  /* ------------------------------------------------- match + la casa elegida -- */
  function vMatch() {
    const c = st.match || ordenados()[0].c, h = c.hab;
    const a = afinidad(c);
    const entra = h.precio <= st.presupuesto;
    const yo = { nombre: 'Vos', color: ['#0F1F3D', '#1E3A5F'] };
    const chequeos = [
      ['Identidad verificada', 'de ' + c.nombre + ', que vive en la casa y ofrece la habitación.'],
      ['La habitación existe', 'fotos y datos revisados por Nidos antes de publicarla.'],
      ['Semáforo de subalquiler', 'si ' + c.nombre + ' alquila, confirmamos que puede compartir la casa.'],
      [entra ? 'Entra en tu presupuesto' : 'Se pasa de tu presupuesto',
        pesos(h.precio) + ' por mes contra ' + pesos(st.presupuesto) + ' que marcaste.']
    ];
    const fotos = h.fotos.map((f, k) =>
      '<div class="dgal__f' + (k === 0 ? ' dgal__f--main' : '') + '" style="background-image:url(' + FOTO(f) + ')"' +
      ' role="img" aria-label="Foto de la casa de ' + esc(c.nombre) + '"></div>').join('');
    return '<section class="dpantalla">' +
      '<div class="dmatch2">' +
        '<div class="dmatch__avatares">' + avatar(yo) + avatar(c) + '</div>' +
        '<div><p class="deyebrow">Es match · ' + a.pct + '% de afinidad</p>' +
        '<h1 class="dtitulo">Vos y ' + esc(c.nombre) + ' <span class="accent">se eligieron.</span></h1>' +
        '<p class="dnota" style="margin-top:6px">' + esc(c.nombre) + ' ya había marcado tu perfil, así que se ' +
          'abrió el chat seguro: sin dar el teléfono y con identidad verificada de las dos partes.</p></div>' +
      '</div>' +
      '<div class="dmsg dmsg--ella dmsg--suelto">¡Hola! La habitación se libera el mes que viene, ¿te sirve?</div>' +
      '<h2 class="dsub">La casa de ' + esc(c.nombre) + ' en ' + esc(barrio(c)) + '</h2>' +
      '<div class="dgal' + (h.fotos.length > 1 ? '' : ' dgal--una') + '">' + fotos + '</div>' +
      '<div class="dhab">' +
        '<div class="dcard"><div class="dviv__cuerpo" style="padding:0">' +
        '<span class="dviv__zona">' + esc(barrio(c)) + ' · ' + h.amb + ' ambientes · ' + esc(h.tag) + '</span>' +
        '<span class="dviv__det">' + esc(h.det) + '</span>' +
        '<span class="dviv__precio">' + pesos(h.precio) + '<small>tu habitación, por mes · ' + usd(h.precio) + '</small></span>' +
        '<span class="dviv__reglas">' + h.reglas.map(r => '<span>· ' + esc(r) + '</span>').join('') + '</span>' +
        '</div></div>' +
        '<div class="dcard"><h3>Lo que ya chequeamos</h3><div class="dresumen" style="margin-top:14px">' +
        chequeos.map((x, k) =>
          '<div class="dresumen__it"><span class="dresumen__ok"' +
          (k === 3 && !entra ? ' style="background:#F59E0B"' : '') + '>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4.5 4.5L19 7"/></svg></span>' +
          '<span><b>' + esc(x[0]) + ':</b> ' + esc(x[1]) + '</span></div>').join('') +
        '</div></div>' +
      '</div>' +
      '<div class="dacciones">' + btnAtras +
      '<button class="btn btn--primary btn--lg" data-ir="' + (st.i + 1) + '">' +
        '<span>Quiero esta habitación</span></button></div></section>';
  }

  /* ----------------------------------------------------------- formalizar --- */
  function vFormalizar() {
    const c = st.match || CANDIDATOS[0];
    const v = { zona: barrio(c), pp: c.hab.precio };
    const adelanto = v.pp * MESES_AD;
    const fee      = v.pp * PCT_FEE;
    const ico = d => '<span class="dlinea__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg></span>';

    return '<section class="dpantalla"><div class="dcabecera">' +
      '<p class="deyebrow">Condiciones de ingreso</p>' +
      '<h1 class="dtitulo">De un acuerdo de palabra<br><span class="accent">a uno por escrito.</span></h1>' +
      '<p class="dbajada">Elegiste la habitación de ' + esc(c.nombre) + ' en ' + esc(v.zona) + ' a ' +
        pesos(v.pp) + ' por mes. Buscar y ' +
        'hacer match no se paga: Nidos cobra solo si te mudás. Esto es todo lo que pagás para ' +
        'entrar, sin garantía propietaria y sin adelantar medio año.</p></div>' +
      '<div class="dform"><div class="dlineas">' +
      '<div class="dlinea">' + ico('<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0"/>') +
      '<span class="dlinea__txt"><strong>Perfil, matching y mensajes</strong>' +
      '<span>Todo lo que hiciste hasta acá. Nunca cobramos por buscar ni por hablar con alguien.</span></span>' +
      '<span class="dlinea__monto"><b>Gratis</b><span>siempre</span></span></div>' +

      '<div class="dlinea dlinea--destaca">' + ico('<path d="M12 3l7.5 3v5.5c0 4.4-3 8.2-7.5 9.5-4.5-1.3-7.5-5.1-7.5-9.5V6L12 3Z"/><path d="m8.8 12 2.3 2.3 4.1-4.4"/>') +
      '<span class="dlinea__txt"><strong>Pack Mudanza Segura</strong>' +
      '<span>Lo que reemplaza la confianza a ciegas del grupo de Facebook, en el momento de cerrar.</span>' +
      '<span class="dsplit"><span class="dsplit__it"><b>Verificación</b> de identidad de las dos partes</span>' +
      '<span class="dsplit__it"><b>Acuerdo de convivencia y económico</b> por escrito y firmado</span>' +
      '<span class="dsplit__it"><b>Depósito custodiado</b> en Mercado Pago: se libera cuando entrás y está todo como se acordó</span>' +
      '<span class="dsplit__it"><b>Semáforo de subalquiler</b>: chequeamos que la casa se pueda compartir</span></span></span>' +
      '<span class="dlinea__monto"><b>' + pesos(P_PACK) + '</b><span>' + usd(P_PACK) + ' · una vez, al cerrar</span></span></div>' +

      '<div class="dlinea">' + ico('<path d="M4 7.5h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-11Z"/><path d="M4 11h16M8 15.5h3"/>') +
      '<span class="dlinea__txt"><strong>Pagos Nidos + Club · opcional</strong>' +
      '<span>Alquiler y gastos de la casa divididos y cobrados mes a mes, con comprobante para todos. ' +
        'Suma tareas, el acuerdo de convivencia a mano y el Club de beneficios. Un precio fijo por hogar.</span></span>' +
      '<span class="dlinea__monto"><b>' + pesos(P_PAGOS) + '</b><span>' + usd(P_PAGOS) + ' · por mes, si lo activan</span></span></div>' +

      '<div class="dlinea dlinea--otrolado">' + ico('<path d="M3 10.5 12 3l9 7.5M5.5 12.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7.5"/><path d="M9.5 21v-5h5v5"/>') +
      '<span class="dlinea__txt"><strong>Fee de éxito · no lo pagás vos</strong>' +
      '<span>' + esc(c.nombre) + ', que ofrece la habitación, paga el ' + Math.round(PCT_FEE * 100) + '% de un mes, descontado ' +
        'del depósito cuando se libera. Si no hay mudanza, nadie paga nada.</span></span>' +
      '<span class="dlinea__monto"><b>' + pesos(fee) + '</b><span>' + usd(fee) + ' · una vez, solo si se cierra</span></span></div>' +
      '</div>' +

      '<div class="dcompara"><h3>Lo que pagás para entrar, comparado</h3>' +
      '<div class="dcompara__fila"><span>Hoy, sin garante: ' + MESES_AD + ' meses de adelanto</span>' +
        '<b class="tachado">' + pesos(adelanto) + ' · ' + usd(adelanto) + '</b></div>' +
      '<div class="dcompara__fila"><span>Con Nidos: el Pack Mudanza Segura</span>' +
        '<b class="bueno">' + pesos(P_PACK) + ' · ' + usd(P_PACK) + '</b></div>' +
      '<div class="dcompara__fila"><span>Depósito de un mes, custodiado (vuelve al final)</span>' +
        '<b class="neutro">' + pesos(v.pp) + '</b></div>' +
      '<p class="dcompara__nota">Calculado sobre el precio de tu habitación. El depósito no es un ' +
        'costo: queda en custodia y se devuelve según el acuerdo. Próximamente: garantía digital ' +
        'para alquilar un lugar entero sin garante, emitida por una aseguradora autorizada.</p></div></div>' +
      '<div class="dacciones">' + btnAtras +
      '<button class="btn btn--primary btn--lg" data-ir="' + (st.i + 1) + '"><span>Continuar con el acuerdo</span></button>' +
      '</div></section>';
  }

  /* ----------------------------------------------------------------- cierre -- */
  function vCierre() {
    const c = st.match || CANDIDATOS[0];
    const v = { zona: barrio(c) };
    const items = [
      ['Semáforo de subalquiler', 'Confirmamos que ' + c.nombre + ' puede compartir la casa (si alquila, con el aval del dueño) antes de que pongas un peso.'],
      ['Firma digital', 'Te llega el acuerdo de convivencia y económico para firmar con ' + c.nombre + '.'],
      ['Depósito custodiado', 'Lo pagás por Mercado Pago y queda retenido: se libera cuando entrás y confirmás que todo está como se acordó.'],
      ['Coordinación de la mudanza', 'Fecha de entrada, llaves y estado de la habitación documentado con fotos.'],
      ['Soporte durante todo el alquiler', 'Canal de reporte y mediación si algo de la convivencia se complica.']
    ];
    return '<section class="dpantalla dcierre">' +
      '<div class="dcierre__ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4.5 4.5L19 7"/></svg></div>' +
      '<h1 class="dtitulo">Tu solicitud está<br><span class="accent">en marcha.</span></h1>' +
      '<p class="dbajada" style="margin-inline:auto">Reservamos la habitación de ' + esc(c.nombre) +
        ' en ' + esc(v.zona) + ' por 48 horas mientras se completa el acuerdo. Esto es lo que sigue:</p>' +
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

    // "Me interesa": en la demo la otra persona ya te eligió, así que hay match
    app.querySelectorAll('[data-quiero]').forEach(b => b.addEventListener('click', () => {
      st.match = CANDIDATOS[Number(b.dataset.quiero)];
      b.classList.add('is-sel');
      setTimeout(() => ir(st.i + 1), 180);
    }));
  }

  $('#dreiniciar').addEventListener('click', () => {
    st.i = 0; st.resp = {}; st.match = null;
    st.presupuesto = 400000; st.zona = ZONAS[0];
    history.replaceState(null, '', location.pathname);
    pintar();
  });

  /* Deep link a una pantalla: ?p=swipe · ?p=formalizar · ?p=4 ...
     Útil para mostrar una pantalla puntual sin recorrer todo el flujo. Si no
     hay respuestas cargadas, usa un perfil de ejemplo para que tenga sentido. */
  (function inicio() {
    const p = new URLSearchParams(location.search).get('p');
    if (!p) return pintar();

    const alias = { viviendas: 'match', lista: 'swipe' };
    const idx = /^\d+$/.test(p) ? Number(p) : PANTALLAS.indexOf(alias[p] || p);
    if (idx < 1) return pintar();

    if (!Object.keys(st.resp).length) {
      // perfil de ejemplo: nocturno, ordenado, tranquilo, sin mascota, sin humo, en casa
      const ejemplo = { horario: 1, orden: .5, social: 0, mascotas: .5, fumar: 0, casa: 1 };
      PREGUNTAS.forEach(q => { st.resp[q.clave] = ejemplo[q.clave]; });
      st.presupuesto = 400000;
      st.match = CANDIDATOS[0];
    }
    ir(idx);
  })();
})();
