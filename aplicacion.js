"use strict";

const ESTADOS_SIN_DATO = new Set([
  "",
  "-",
  "---",
  "_n/a",
  "n/a",
  "no reporta",
  "null",
  "none",
]);


const ETIQUETAS_PARAMETROS = Object.freeze({
  CM_M1: "Configuración manual de la mano 1",
  CM_M2: "Configuración manual de la mano 2",
  CM_bimanual: "Configuración manual de ambas manos",
  LOC_1: "Ubicación en la mano 1",
  LOC_bimanual: "Ubicación en ambas manos",
  MOV_M1: "Movimiento de la mano 1",
  MOV_M2: "Movimiento de la mano 2",
  MOV_bimanual: "Movimiento de ambas manos",
  N_MANOS: "Número de manos",
  OR_M1: "Orientación de la mano 1",
  OR_M2: "Orientación de la mano 2",
  OR_bimanual: "Orientación de ambas manos",
});

const estado = {
  catalogo: null,
  conceptosFiltrados: [],
  conceptoSeleccionado: null,
  alternativaSeleccionada: null,
  camposSemanticos: [],
  camposSemanticosSeleccionados: new Set(),
  tipoVariacion: "todas",
  soloConVideo: false,
  redVariacionAbierta: false,
};

const listaConceptos = document.querySelector("#lista-conceptos");
const panelDetalle = document.querySelector("#panel-detalle");
const buscador = document.querySelector("#buscador");
const contadorResultados = document.querySelector("#contador-resultados");
const fechaActualizacion = document.querySelector("#fecha-actualizacion");
const resumenCatalogo = document.querySelector("#resumen-catalogo");
const selectorCampos = document.querySelector("#selector-campos");
const resumenCampos = document.querySelector("#resumen-campos");
const buscadorCampos = document.querySelector("#buscador-campos");
const listaCampos = document.querySelector("#lista-campos");
const camposSeleccionados = document.querySelector("#campos-seleccionados");
const filtroVariacion = document.querySelector("#filtro-variacion");
const filtroVideo = document.querySelector("#filtro-video");
const limpiarFiltros = document.querySelector("#limpiar-filtros");

function tieneDato(valor) {
  if (valor === null || valor === undefined) return false;
  return !ESTADOS_SIN_DATO.has(String(valor).trim().toLowerCase());
}

function mostrarDato(valor, reemplazo = "Sin registrar") {
  return tieneDato(valor) ? String(valor) : reemplazo;
}

function etiquetaParametro(codigo) {
  if (!tieneDato(codigo)) return "";
  const clave = String(codigo).trim();
  return ETIQUETAS_PARAMETROS[clave] ?? clave;
}

function escaparHTML(valor) {
  return String(valor ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizarBusqueda(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function obtenerSufijoAlternativa(id) {
  const coincidencia = String(id).match(/-(\d+)([a-z]+)$/i);
  if (!coincidencia) {
    return { numero: "Sin clasificar", letra: id, valido: false };
  }
  return {
    numero: coincidencia[1],
    letra: coincidencia[2].toLowerCase(),
    valido: true,
  };
}

function convertirVideoAEmbed(url) {
  if (!tieneDato(url)) return "";

  try {
    const videoUrl = new URL(url);
    let id = "";

    if (videoUrl.hostname.includes("youtu.be")) {
      id = videoUrl.pathname.slice(1);
    } else if (videoUrl.hostname.includes("youtube.com")) {
      if (videoUrl.pathname === "/watch") {
        id = videoUrl.searchParams.get("v") || "";
      } else if (videoUrl.pathname.startsWith("/embed/")) {
        id = videoUrl.pathname.split("/")[2] || "";
      } else if (videoUrl.pathname.startsWith("/shorts/")) {
        id = videoUrl.pathname.split("/")[2] || "";
      }
    }

    if (!id) return "";
    id = id.split("?")[0].split("&")[0];
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}`;
  } catch {
    return "";
  }
}

function agruparAlternativas(alternativas) {
  const grupos = new Map();

  for (const alternativa of alternativas) {
    const sufijo = obtenerSufijoAlternativa(alternativa.id);
    const clave = sufijo.numero;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push({ ...alternativa, sufijo });
  }

  for (const alternativasGrupo of grupos.values()) {
    alternativasGrupo.sort((a, b) =>
      a.sufijo.letra.localeCompare(b.sufijo.letra, "es", { numeric: true }),
    );
  }

  return [...grupos.entries()].sort((a, b) => {
    const numeroA = Number(a[0]);
    const numeroB = Number(b[0]);
    if (Number.isNaN(numeroA) || Number.isNaN(numeroB)) {
      return String(a[0]).localeCompare(String(b[0]), "es", { numeric: true });
    }
    return numeroA - numeroB;
  });
}

function estadisticasConcepto(concepto) {
  const grupos = agruparAlternativas(concepto.alternativas ?? []);
  return {
    alternativasLexicas: grupos.length,
    variantes: concepto.alternativas?.length ?? 0,
    ocurrencias: (concepto.alternativas ?? []).reduce(
      (total, alternativa) => total + (alternativa.ocurrencias?.length ?? 0),
      0,
    ),
  };
}

function textoBusquedaConcepto(concepto) {
  const partes = [concepto.id, concepto.sem_1, concepto.sem_2];

  for (const alternativa of concepto.alternativas ?? []) {
    partes.push(
      alternativa.id,
      alternativa.alt_componente,
      alternativa.varia_para,
      alternativa.varia_alt,
      alternativa.geo_imp,
      alternativa.geo_dtbs,
      alternativa.eta,
      alternativa.registro,
    );

    for (const ocurrencia of alternativa.ocurrencias ?? []) {
      partes.push(
        ocurrencia.glosa_original,
        ocurrencia.id_fuente,
        ocurrencia.fuente_repositorio,
        ocurrencia.fuente_2,
        ocurrencia.fuente_region,
      );
    }
  }

  for (const relacion of concepto.relaciones_fonologicas_adicionales ?? []) {
    partes.push(
      relacion.alternativa_a,
      relacion.alternativa_b,
      relacion.parametro,
    );
  }

  return normalizarBusqueda(partes.filter(tieneDato).join(" "));
}

function camposSemanticosConcepto(concepto) {
  const campos = [concepto.sem_1, concepto.sem_2]
    .filter(tieneDato)
    .map((valor) => normalizarBusqueda(valor));
  return [...new Set(campos)];
}

function prepararCamposSemanticos() {
  const porClave = new Map();

  for (const concepto of estado.catalogo.conceptos ?? []) {
    for (const valor of [concepto.sem_1, concepto.sem_2]) {
      if (!tieneDato(valor)) continue;
      const etiqueta = String(valor).trim();
      const clave = normalizarBusqueda(etiqueta);
      if (!porClave.has(clave)) porClave.set(clave, etiqueta);
    }
  }

  estado.camposSemanticos = [...porClave.entries()]
    .map(([clave, etiqueta]) => ({ clave, etiqueta }))
    .sort((a, b) =>
      a.etiqueta.localeCompare(b.etiqueta, "es", { sensitivity: "base" }),
    );
}

function etiquetaCampoPorClave(clave) {
  return estado.camposSemanticos.find((campo) => campo.clave === clave)?.etiqueta
    ?? clave;
}

function renderizarOpcionesCampos() {
  const consulta = normalizarBusqueda(buscadorCampos.value);
  const disponibles = estado.camposSemanticos.filter((campo) =>
    !consulta || normalizarBusqueda(campo.etiqueta).includes(consulta),
  );

  listaCampos.innerHTML = "";

  if (disponibles.length === 0) {
    listaCampos.innerHTML = '<p class="sin-opciones">No se encontraron campos.</p>';
    return;
  }

  const fragmento = document.createDocumentFragment();

  for (const campo of disponibles) {
    const etiqueta = document.createElement("label");
    etiqueta.className = "opcion-campo";

    const casilla = document.createElement("input");
    casilla.type = "checkbox";
    casilla.value = campo.clave;
    casilla.checked = estado.camposSemanticosSeleccionados.has(campo.clave);
    casilla.addEventListener("change", () => {
      if (casilla.checked) {
        estado.camposSemanticosSeleccionados.add(campo.clave);
      } else {
        estado.camposSemanticosSeleccionados.delete(campo.clave);
      }
      actualizarPresentacionCampos();
      filtrarConceptos();
    });

    const texto = document.createElement("span");
    texto.textContent = campo.etiqueta;

    etiqueta.append(casilla, texto);
    fragmento.appendChild(etiqueta);
  }

  listaCampos.appendChild(fragmento);
}

function renderizarCamposSeleccionados() {
  camposSeleccionados.innerHTML = "";

  if (estado.camposSemanticosSeleccionados.size === 0) return;

  const fragmento = document.createDocumentFragment();
  const clavesOrdenadas = [...estado.camposSemanticosSeleccionados].sort((a, b) =>
    etiquetaCampoPorClave(a).localeCompare(etiquetaCampoPorClave(b), "es", {
      sensitivity: "base",
    }),
  );

  for (const clave of clavesOrdenadas) {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "chip-campo";
    boton.setAttribute("aria-label", `Quitar ${etiquetaCampoPorClave(clave)}`);
    boton.innerHTML = `${escaparHTML(etiquetaCampoPorClave(clave))}<span aria-hidden="true">×</span>`;
    boton.addEventListener("click", () => {
      estado.camposSemanticosSeleccionados.delete(clave);
      actualizarPresentacionCampos();
      filtrarConceptos();
    });
    fragmento.appendChild(boton);
  }

  camposSeleccionados.appendChild(fragmento);
}

function actualizarPresentacionCampos() {
  const cantidad = estado.camposSemanticosSeleccionados.size;
  if (cantidad === 0) {
    resumenCampos.textContent = "Seleccionar campo…";
  } else if (cantidad === 1) {
    const [clave] = estado.camposSemanticosSeleccionados;
    resumenCampos.textContent = etiquetaCampoPorClave(clave);
  } else {
    resumenCampos.textContent = `${cantidad} campos seleccionados`;
  }

  renderizarOpcionesCampos();
  renderizarCamposSeleccionados();
}

function tipoVariacionConcepto(concepto) {
  const grupos = new Map();

  for (const alternativa of concepto.alternativas ?? []) {
    const sufijo = obtenerSufijoAlternativa(alternativa.id);
    if (!sufijo.valido) continue;
    if (!grupos.has(sufijo.numero)) grupos.set(sufijo.numero, new Set());
    grupos.get(sufijo.numero).add(sufijo.letra);
  }

  if (grupos.size === 0) return "sin_clasificar";

  const variacionLexica = grupos.size > 1;
  const variacionFonologica = [...grupos.values()].some(
    (letras) => letras.size > 1,
  );

  if (!variacionLexica && !variacionFonologica) return "sin_variacion";
  if (variacionLexica && !variacionFonologica) return "solo_lexica";
  if (!variacionLexica && variacionFonologica) return "solo_fonologica";
  return "lexica_y_fonologica";
}

function conceptoTieneVideo(concepto) {
  return (concepto.alternativas ?? []).some((alternativa) =>
    tieneDato(alternativa.video_url),
  );
}

function hayFiltrosActivos() {
  return Boolean(
    normalizarBusqueda(buscador.value)
    || estado.camposSemanticosSeleccionados.size > 0
    || estado.tipoVariacion !== "todas"
    || estado.soloConVideo,
  );
}

function actualizarBotonLimpiar() {
  limpiarFiltros.disabled = !hayFiltrosActivos();
}

function renderizarListaConceptos() {
  listaConceptos.innerHTML = "";
  contadorResultados.textContent = `${estado.conceptosFiltrados.length} concepto(s)`;

  if (estado.conceptosFiltrados.length === 0) {
    listaConceptos.innerHTML = '<p class="sin-resultados">No se encontraron conceptos.</p>';
    return;
  }

  const fragmento = document.createDocumentFragment();

  for (const concepto of estado.conceptosFiltrados) {
    const datos = estadisticasConcepto(concepto);
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "boton-concepto";
    boton.innerHTML = `
      <span class="nombre-concepto">${escaparHTML(concepto.id)}</span>
      <span class="conteo-concepto">${datos.variantes} variante(s)</span>
    `;
    boton.classList.toggle(
      "activo",
      estado.conceptoSeleccionado?.id === concepto.id,
    );
    boton.addEventListener("click", () => seleccionarConcepto(concepto.id));
    fragmento.appendChild(boton);
  }

  listaConceptos.appendChild(fragmento);
}

function actualizarEnlace(conceptoId, alternativaId = "") {
  const parametros = new URLSearchParams();
  parametros.set("concepto", conceptoId);
  if (alternativaId) parametros.set("alternativa", alternativaId);
  history.replaceState(null, "", `#${parametros.toString()}`);
}

function leerEnlaceInicial() {
  const contenido = window.location.hash.replace(/^#/, "");
  const parametros = new URLSearchParams(contenido);
  return {
    conceptoId: parametros.get("concepto") || "",
    alternativaId: parametros.get("alternativa") || "",
  };
}

function seleccionarConcepto(conceptoId, alternativaId = "") {
  const concepto = estado.catalogo.conceptos.find(
    (item) => item.id === conceptoId,
  );
  if (!concepto) return;

  const cambioConcepto = estado.conceptoSeleccionado?.id !== concepto.id;
  if (cambioConcepto) estado.redVariacionAbierta = false;

  estado.conceptoSeleccionado = concepto;
  estado.alternativaSeleccionada =
    concepto.alternativas.find((item) => item.id === alternativaId)
    ?? concepto.alternativas[0]
    ?? null;
  actualizarEnlace(concepto.id, estado.alternativaSeleccionada?.id ?? "");
  renderizarListaConceptos();
  renderizarConcepto();
}

function crearEtiquetasSemanticas(concepto) {
  const valores = [concepto.sem_1, concepto.sem_2].filter(tieneDato);
  if (valores.length === 0) {
    return '<span class="sin-datos">Sin campos semánticos registrados</span>';
  }
  return valores
    .map((valor) => `<span class="etiqueta">${escaparHTML(valor)}</span>`)
    .join("");
}

function renderizarAlternativas(concepto) {
  const grupos = agruparAlternativas(concepto.alternativas);

  if (grupos.length === 0) {
    return '<p class="sin-datos">No hay alternativas vinculadas.</p>';
  }

  return grupos
    .map(([numero, alternativas]) => {
      const botones = alternativas
        .map((alternativa) => {
          const activa = estado.alternativaSeleccionada?.id === alternativa.id;
          const tieneVideo = tieneDato(alternativa.video_url);
          return `
            <button
              type="button"
              class="boton-variante${activa ? " activo" : ""}"
              data-alternativa-id="${escaparHTML(alternativa.id)}"
              title="${escaparHTML(alternativa.id)}"
            >
              ${escaparHTML(numero + alternativa.sufijo.letra)}
              ${tieneVideo ? '<span class="indicador-video" title="Video vinculado">▶</span>' : ""}
            </button>
          `;
        })
        .join("");

      return `
        <div class="grupo-lexico">
          <h4>Alternativa léxica ${escaparHTML(numero)}</h4>
          <div class="botones-variantes">${botones}</div>
        </div>
      `;
    })
    .join("");
}


const PALETA_RED = Object.freeze([
  { borde: "#7651b5", fondo: "#f1ecfa", texto: "#563690" },
  { borde: "#2978b8", fondo: "#eaf4fc", texto: "#175b91" },
  { borde: "#d58a13", fondo: "#fff6df", texto: "#9a5b00" },
  { borde: "#4b9a4a", fondo: "#ecf8eb", texto: "#2f7430" },
  { borde: "#b55378", fondo: "#faedf2", texto: "#8a3658" },
  { borde: "#687b8c", fondo: "#edf1f4", texto: "#465765" },
]);

function colorRed(indice) {
  return PALETA_RED[indice % PALETA_RED.length];
}

function etiquetaBreveAlternativa(id) {
  const sufijo = obtenerSufijoAlternativa(id);
  return sufijo.valido ? `${sufijo.numero}${sufijo.letra}` : String(id);
}

function calcularDisposicionNodos(cantidad) {
  const anchoNodo = 96;
  const altoNodo = 54;

  if (cantidad <= 1) {
    return {
      ancho: 280,
      alto: 150,
      anchoNodo,
      altoNodo,
      posiciones: [{ x: 92, y: 58 }],
    };
  }

  if (cantidad === 2) {
    return {
      ancho: 430,
      alto: 165,
      anchoNodo,
      altoNodo,
      posiciones: [
        { x: 34, y: 60 },
        { x: 300, y: 60 },
      ],
    };
  }

  if (cantidad === 3) {
    return {
      ancho: 430,
      alto: 270,
      anchoNodo,
      altoNodo,
      posiciones: [
        { x: 34, y: 42 },
        { x: 300, y: 42 },
        { x: 167, y: 178 },
      ],
    };
  }

  if (cantidad === 4) {
    return {
      ancho: 430,
      alto: 300,
      anchoNodo,
      altoNodo,
      posiciones: [
        { x: 34, y: 42 },
        { x: 300, y: 42 },
        { x: 34, y: 204 },
        { x: 300, y: 204 },
      ],
    };
  }

  const columnas = cantidad <= 6 ? 3 : 4;
  const separacionX = 92;
  const separacionY = 88;
  const margenX = 30;
  const margenSuperior = 44;
  const filas = Math.ceil(cantidad / columnas);
  const ancho = margenX * 2 + columnas * anchoNodo + (columnas - 1) * separacionX;
  const alto = margenSuperior + filas * altoNodo + (filas - 1) * separacionY + 42;
  const posiciones = [];

  for (let indice = 0; indice < cantidad; indice += 1) {
    const fila = Math.floor(indice / columnas);
    const columna = indice % columnas;
    const elementosFila = Math.min(columnas, cantidad - fila * columnas);
    const anchoFila = elementosFila * anchoNodo + (elementosFila - 1) * separacionX;
    const inicioFila = (ancho - anchoFila) / 2;
    posiciones.push({
      x: inicioFila + columna * (anchoNodo + separacionX),
      y: margenSuperior + fila * (altoNodo + separacionY),
    });
  }

  return { ancho, alto, anchoNodo, altoNodo, posiciones };
}

function relacionesValidasGrupo(alternativas, relacionesAdicionales = []) {
  const porId = new Map(alternativas.map((alternativa) => [alternativa.id, alternativa]));
  const relaciones = [];
  const vistas = new Set();

  const registrarRelacion = (origen, destino, codigo, origenDatos) => {
    const idOrigen = String(origen ?? "").trim();
    const idDestino = String(destino ?? "").trim();
    const parametro = String(codigo ?? "").trim();

    if (
      !idOrigen
      || !idDestino
      || idOrigen === idDestino
      || !parametro
      || !porId.has(idOrigen)
      || !porId.has(idDestino)
    ) {
      return;
    }

    const extremos = [idOrigen, idDestino].sort();
    const clave = `${extremos.join("||")}||${parametro}`;
    if (vistas.has(clave)) return;
    vistas.add(clave);

    relaciones.push({
      origen: idOrigen,
      destino: idDestino,
      codigo: parametro,
      origenDatos,
    });
  };

  for (const alternativa of alternativas) {
    if (!tieneDato(alternativa.varia_alt) || !tieneDato(alternativa.varia_para)) {
      continue;
    }
    registrarRelacion(
      alternativa.varia_alt,
      alternativa.id,
      alternativa.varia_para,
      "analisis",
    );
  }

  for (const relacion of relacionesAdicionales) {
    registrarRelacion(
      relacion.alternativa_a,
      relacion.alternativa_b,
      relacion.parametro,
      "relfono",
    );
  }

  return relaciones;
}

function renderizarEtiquetaRelacion(x, y, codigo) {
  const texto = String(codigo);
  const ancho = Math.max(58, texto.length * 7.2 + 18);
  return `
    <g class="etiqueta-relacion-red" transform="translate(${x - ancho / 2} ${y - 13})">
      <rect width="${ancho}" height="26" rx="13"></rect>
      <text x="${ancho / 2}" y="17" text-anchor="middle">${escaparHTML(texto)}</text>
    </g>
  `;
}

function renderizarGrupoRed(numero, alternativas, indiceGrupo, relacionesAdicionales) {
  const color = colorRed(indiceGrupo);
  const disposicion = calcularDisposicionNodos(alternativas.length);
  const posiciones = new Map();
  alternativas.forEach((alternativa, indice) => {
    posiciones.set(alternativa.id, disposicion.posiciones[indice]);
  });

  const relaciones = relacionesValidasGrupo(alternativas, relacionesAdicionales);
  const referencias = new Set(
    relaciones
      .filter((relacion) => relacion.origenDatos === "analisis")
      .map((relacion) => relacion.origen),
  );

  const lineas = relaciones.map((relacion, indice) => {
    const inicio = posiciones.get(relacion.origen);
    const fin = posiciones.get(relacion.destino);
    if (!inicio || !fin) return "";

    const x1 = inicio.x + disposicion.anchoNodo / 2;
    const y1 = inicio.y + disposicion.altoNodo / 2;
    const x2 = fin.x + disposicion.anchoNodo / 2;
    const y2 = fin.y + disposicion.altoNodo / 2;
    const desplazamiento = relaciones.length > 2 ? (indice % 2 === 0 ? -10 : 10) : 0;
    const medioX = (x1 + x2) / 2;
    const medioY = (y1 + y2) / 2 + desplazamiento;

    return `
      <line class="linea-red" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line>
      ${renderizarEtiquetaRelacion(medioX, medioY, relacion.codigo)}
    `;
  }).join("");

  const nodos = alternativas.map((alternativa) => {
    const posicion = posiciones.get(alternativa.id);
    const etiqueta = etiquetaBreveAlternativa(alternativa.id);
    const activa = estado.alternativaSeleccionada?.id === alternativa.id;
    const referencia = referencias.has(alternativa.id);
    const clases = ["nodo-red"];
    if (activa) clases.push("activo");
    if (referencia) clases.push("referencia");

    return `
      <g
        class="${clases.join(" ")}"
        data-red-alternativa="${escaparHTML(alternativa.id)}"
        role="button"
        tabindex="0"
        aria-label="Abrir ${escaparHTML(alternativa.id)}"
        transform="translate(${posicion.x} ${posicion.y})"
      >
        <title>${escaparHTML(alternativa.id)}</title>
        <rect width="${disposicion.anchoNodo}" height="${disposicion.altoNodo}" rx="12"></rect>
        <text
          class="texto-nodo-red"
          x="${disposicion.anchoNodo / 2}"
          y="${disposicion.altoNodo / 2 + 6}"
          text-anchor="middle"
        >${escaparHTML(etiqueta)}</text>
      </g>
    `;
  }).join("");

  return `
    <article
      class="grupo-red"
      style="--red-borde:${color.borde}; --red-fondo:${color.fondo}; --red-texto:${color.texto};"
    >
      <h4>Alternativa léxica ${escaparHTML(numero)}</h4>
      <div class="lienzo-red" tabindex="0">
        <svg
          viewBox="0 0 ${disposicion.ancho} ${disposicion.alto}"
          role="img"
          aria-label="Variantes de la alternativa léxica ${escaparHTML(numero)}"
        >
          ${lineas}
          ${nodos}
        </svg>
      </div>
    </article>
  `;
}

function parametrosRedConcepto(concepto) {
  const parametros = new Set();
  const grupos = agruparAlternativas(concepto.alternativas ?? []);
  for (const [, alternativas] of grupos) {
    for (const relacion of relacionesValidasGrupo(
      alternativas,
      concepto.relaciones_fonologicas_adicionales ?? [],
    )) {
      parametros.add(relacion.codigo);
    }
  }
  return [...parametros].sort((a, b) => a.localeCompare(b, "es"));
}

function renderizarRedVariacion(concepto) {
  const alternativas = concepto.alternativas ?? [];
  if (alternativas.length <= 1) return "";

  const grupos = agruparAlternativas(alternativas);
  const relacionesAdicionales = concepto.relaciones_fonologicas_adicionales ?? [];
  const tarjetas = grupos
    .map(([numero, alternativasGrupo], indice) =>
      renderizarGrupoRed(
        numero,
        alternativasGrupo,
        indice,
        relacionesAdicionales,
      ),
    )
    .join("");
  const parametros = parametrosRedConcepto(concepto);
  const leyendaParametros = parametros.length
    ? `
      <div class="leyenda-parametros-red" aria-label="Códigos de análisis presentes">
        ${parametros.map((codigo) => `
          <span class="item-parametro-red">
            <code>${escaparHTML(codigo)}</code>
            <span>${escaparHTML(etiquetaParametro(codigo))}</span>
          </span>
        `).join("")}
      </div>
    `
    : "";

  return `
    <details
      id="red-variacion"
      class="bloque bloque-red-variacion"
      ${estado.redVariacionAbierta ? "open" : ""}
    >
      <summary class="resumen-red-variacion">
        <span>Red de variación léxica y fonológica</span>
        <span class="indicador-desplegable" aria-hidden="true"></span>
      </summary>
      <div class="contenido-red-variacion">
        <p class="explicacion-red-variacion">
          Cada bloque corresponde a una alternativa léxica. Las líneas relacionan
          únicamente variantes fonológicas del mismo bloque.
        </p>
        <div class="rejilla-redes">${tarjetas}</div>
        ${leyendaParametros}
      </div>
    </details>
  `;
}

function filaDato(titulo, valor) {
  if (!tieneDato(valor)) return "";
  return `
    <div class="dato">
      <dt>${escaparHTML(titulo)}</dt>
      <dd>${escaparHTML(valor)}</dd>
    </div>
  `;
}

function filaCodigo(titulo, valor) {
  if (!tieneDato(valor)) return "";
  return `
    <div class="dato">
      <dt>${escaparHTML(titulo)}</dt>
      <dd><code>${escaparHTML(valor)}</code></dd>
    </div>
  `;
}

function renderizarVideo(alternativa) {
  const embedUrl = convertirVideoAEmbed(alternativa.video_url);
  if (!embedUrl) {
    return `
      <div class="video-ausente">
        Video regrabado no disponible en esta versión del catálogo.
      </div>
    `;
  }

  return `
    <div class="video-contenedor">
      <iframe
        src="${escaparHTML(embedUrl)}"
        title="Video de ${escaparHTML(alternativa.id)}"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowfullscreen
      ></iframe>
    </div>
  `;
}

function renderizarOcurrencias(alternativa) {
  const ocurrencias = alternativa.ocurrencias ?? [];
  if (ocurrencias.length === 0) {
    return '<p class="sin-datos">No hay ocurrencias vinculadas a esta alternativa.</p>';
  }

  const filas = ocurrencias
    .map((ocurrencia) => `
      <tr>
        <td>${escaparHTML(mostrarDato(ocurrencia.glosa_original))}</td>
        <td>${escaparHTML(
          tieneDato(ocurrencia.fuente_repositorio)
            ? ocurrencia.fuente_repositorio
            : mostrarDato(ocurrencia.fuente_2)
        )}</td>
        <td>${escaparHTML(mostrarDato(ocurrencia.id_fuente))}</td>
        <td>${escaparHTML(mostrarDato(ocurrencia.fuente_fecha))}</td>
        <td>${escaparHTML(mostrarDato(ocurrencia.fuente_region))}</td>
        <td>${escaparHTML(mostrarDato(ocurrencia.fuente_formato))}</td>
      </tr>
    `)
    .join("");

  return `
    <p>${ocurrencias.length} ocurrencia(s) documentada(s).</p>
    <div class="tabla-contenedor">
      <table>
        <thead>
          <tr>
            <th>Glosa original</th>
            <th>Fuente</th>
            <th>Código</th>
            <th>Fecha</th>
            <th>Región de la fuente</th>
            <th>Formato</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
  `;
}

function renderizarSociolinguistica(alternativa) {
  const filas = [
    filaDato("Frecuencia (impresos)", alternativa.freq_imp),
    filaDato("Frecuencia (base de datos)", alternativa.freq_dtbs),
    filaDato("Geografía (impresos)", alternativa.geo_imp),
    filaDato("Geografía (base de datos)", alternativa.geo_dtbs),
    filaDato("Grupo etario", alternativa.eta),
    filaDato("Información socioeconómica", alternativa.socioec),
    filaDato("Registro", alternativa.registro),
  ].filter(Boolean);

  if (filas.length === 0) {
    return '<p class="sin-datos">No hay información sociolingüística registrada para esta alternativa.</p>';
  }

  return `<dl class="resumen-datos">${filas.join("")}</dl>`;
}

function renderizarOtrosDatos(alternativa) {
  const filas = [
    filaDato("Etimología", alternativa.etimologia),
    filaDato("Iconicidad", alternativa.inconicidad),
    filaDato("Matiz", alternativa.matiz),
    filaDato("Posible influencia del español", alternativa.espanol),
  ].filter(Boolean);

  if (filas.length === 0) {
    return '<p class="sin-datos">No hay otros datos registrados para esta alternativa.</p>';
  }

  return `<dl class="resumen-datos">${filas.join("")}</dl>`;
}

function renderizarFichaAlternativa(alternativa) {
  if (!alternativa) {
    return '<p class="sin-datos">Este concepto no tiene alternativas.</p>';
  }

  const parametroComprensible = etiquetaParametro(alternativa.varia_para);
  const fonologia = tieneDato(alternativa.varia_alt) || tieneDato(alternativa.varia_para)
    ? `
      <div class="bloque">
        <h4>Diferencia fonológica registrada</h4>
        <dl class="resumen-datos">
          ${filaDato("Variante de referencia", alternativa.varia_alt)}
          ${filaDato("Parámetro que cambia", parametroComprensible)}
          ${filaCodigo("Código de análisis", alternativa.varia_para)}
        </dl>
      </div>
    `
    : "";

  const composicionFilas = [
    filaDato("Número de componentes", alternativa.n_componentes),
    filaDato("Alternativa del componente", alternativa.alt_componente),
    filaDato("Permutación libre", alternativa.libre_perm),
  ].filter(Boolean);

  const composicion = composicionFilas.length
    ? `
      <div class="bloque">
        <h4>Composición</h4>
        <dl class="resumen-datos">${composicionFilas.join("")}</dl>
      </div>
    `
    : "";

  return `
    <article class="ficha-alternativa">
      <h3 class="identificador-alternativa">${escaparHTML(alternativa.id)}</h3>
      <p class="clasificacion-alternativa">
        Alternativa léxica ${escaparHTML(obtenerSufijoAlternativa(alternativa.id).numero)} ·
        Variante fonológica ${escaparHTML(obtenerSufijoAlternativa(alternativa.id).letra)}
      </p>
      ${renderizarVideo(alternativa)}
      ${fonologia}
      ${composicion}

      <div class="bloque">
        <div class="pestanas" role="tablist" aria-label="Información de la alternativa">
          <button class="boton-pestana activo" type="button" role="tab" data-pestana="ocurrencias">Ocurrencias y fuentes</button>
          <button class="boton-pestana" type="button" role="tab" data-pestana="sociolinguistica">Sociolingüística</button>
          <button class="boton-pestana" type="button" role="tab" data-pestana="otros">Otros datos</button>
        </div>
        <section class="panel-pestana" data-panel="ocurrencias">
          ${renderizarOcurrencias(alternativa)}
        </section>
        <section class="panel-pestana" data-panel="sociolinguistica" hidden>
          ${renderizarSociolinguistica(alternativa)}
        </section>
        <section class="panel-pestana" data-panel="otros" hidden>
          ${renderizarOtrosDatos(alternativa)}
        </section>
      </div>
    </article>
  `;
}

function renderizarConcepto() {
  const concepto = estado.conceptoSeleccionado;
  if (!concepto) return;

  const datos = estadisticasConcepto(concepto);
  panelDetalle.innerHTML = `
    <header class="cabecera-concepto">
      <h2>${escaparHTML(concepto.id)}</h2>
      <div class="campos-semanticos">
        ${crearEtiquetasSemanticas(concepto)}
      </div>
      <p class="resumen-concepto">
        ${datos.alternativasLexicas} alternativa(s) léxica(s) ·
        ${datos.variantes} variante(s) ·
        ${datos.ocurrencias} ocurrencia(s)
      </p>
    </header>

    <section class="bloque">
      <h3>Alternativas</h3>
      ${renderizarAlternativas(concepto)}
    </section>

    ${renderizarRedVariacion(concepto)}

    <section id="contenedor-alternativa">
      ${renderizarFichaAlternativa(estado.alternativaSeleccionada)}
    </section>
  `;

  document.querySelectorAll("[data-alternativa-id]").forEach((boton) => {
    boton.addEventListener("click", () => {
      const alternativa = concepto.alternativas.find(
        (item) => item.id === boton.dataset.alternativaId,
      );
      if (!alternativa) return;
      estado.alternativaSeleccionada = alternativa;
      actualizarEnlace(concepto.id, alternativa.id);
      renderizarConcepto();
    });
  });

  const detalleRed = document.querySelector("#red-variacion");
  if (detalleRed) {
    detalleRed.addEventListener("toggle", () => {
      estado.redVariacionAbierta = detalleRed.open;
    });
  }

  document.querySelectorAll("[data-red-alternativa]").forEach((nodo) => {
    const activarNodo = () => {
      const alternativa = concepto.alternativas.find(
        (item) => item.id === nodo.dataset.redAlternativa,
      );
      if (!alternativa) return;
      estado.alternativaSeleccionada = alternativa;
      actualizarEnlace(concepto.id, alternativa.id);
      renderizarConcepto();
    };

    nodo.addEventListener("click", activarNodo);
    nodo.addEventListener("keydown", (evento) => {
      if (evento.key === "Enter" || evento.key === " ") {
        evento.preventDefault();
        activarNodo();
      }
    });
  });

  document.querySelectorAll("[data-pestana]").forEach((boton) => {
    boton.addEventListener("click", () => activarPestana(boton.dataset.pestana));
  });
}

function activarPestana(nombre) {
  document.querySelectorAll("[data-pestana]").forEach((boton) => {
    boton.classList.toggle("activo", boton.dataset.pestana === nombre);
  });
  document.querySelectorAll("[data-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== nombre;
  });
}

function filtrarConceptos() {
  const consulta = normalizarBusqueda(buscador.value);

  estado.conceptosFiltrados = estado.catalogo.conceptos.filter((concepto) => {
    const cumpleTexto = !consulta || concepto._textoBusqueda.includes(consulta);

    const camposConcepto = concepto._camposSemanticos ?? [];
    const cumpleCampo = estado.camposSemanticosSeleccionados.size === 0
      || camposConcepto.some((campo) =>
        estado.camposSemanticosSeleccionados.has(campo),
      );

    const cumpleVariacion = estado.tipoVariacion === "todas"
      || concepto._tipoVariacion === estado.tipoVariacion;

    const cumpleVideo = !estado.soloConVideo || concepto._tieneVideo;

    return cumpleTexto && cumpleCampo && cumpleVariacion && cumpleVideo;
  });

  actualizarBotonLimpiar();

  if (estado.conceptosFiltrados.length === 0) {
    estado.conceptoSeleccionado = null;
    estado.alternativaSeleccionada = null;
    renderizarListaConceptos();
    panelDetalle.innerHTML = `
      <div class="estado-inicial">
        <h2>No hay conceptos que cumplan los filtros</h2>
        <p>Modifica la búsqueda o limpia los filtros para ver más resultados.</p>
      </div>
    `;
    return;
  }

  const seleccionVisible = estado.conceptosFiltrados.some(
    (concepto) => concepto.id === estado.conceptoSeleccionado?.id,
  );

  if (!seleccionVisible) {
    seleccionarConcepto(estado.conceptosFiltrados[0].id);
    return;
  }

  renderizarListaConceptos();
}

function mostrarError(error) {
  const plantilla = document.querySelector("#plantilla-error");
  const contenido = plantilla.content.cloneNode(true);
  contenido.querySelector("p").textContent = error.message;
  panelDetalle.replaceChildren(contenido);
}

async function iniciar() {
  try {
    const respuesta = await fetch("catalogo.json", { cache: "no-store" });
    if (!respuesta.ok) {
      throw new Error(`No se pudo leer catalogo.json (${respuesta.status}).`);
    }

    estado.catalogo = await respuesta.json();
    for (const concepto of estado.catalogo.conceptos ?? []) {
      concepto._textoBusqueda = textoBusquedaConcepto(concepto);
      concepto._camposSemanticos = camposSemanticosConcepto(concepto);
      concepto._tipoVariacion = tipoVariacionConcepto(concepto);
      concepto._tieneVideo = conceptoTieneVideo(concepto);
    }
    prepararCamposSemanticos();
    actualizarPresentacionCampos();
    estado.conceptosFiltrados = estado.catalogo.conceptos ?? [];

    const metadatos = estado.catalogo.metadatos ?? {};
    const fecha = metadatos.fecha_generacion;
    fechaActualizacion.textContent = fecha
      ? `Datos generados: ${new Date(fecha).toLocaleString("es-CO")}`
      : "";
    resumenCatalogo.textContent = [
      `${metadatos.conceptos_exportados ?? 0} conceptos`,
      `${metadatos.alternativas_exportadas ?? 0} variantes`,
      `${metadatos.ocurrencias_exportadas ?? 0} ocurrencias`,
    ].join(" · ");

    renderizarListaConceptos();
    if (estado.conceptosFiltrados.length > 0) {
      const enlaceInicial = leerEnlaceInicial();
      const conceptoInicial = estado.catalogo.conceptos.find(
        (item) => item.id === enlaceInicial.conceptoId,
      );
      seleccionarConcepto(
        conceptoInicial?.id ?? estado.conceptosFiltrados[0].id,
        enlaceInicial.alternativaId,
      );
    }
  } catch (error) {
    mostrarError(error);
  }
}

buscador.addEventListener("input", filtrarConceptos);

buscadorCampos.addEventListener("input", renderizarOpcionesCampos);

filtroVariacion.addEventListener("change", () => {
  estado.tipoVariacion = filtroVariacion.value;
  filtrarConceptos();
});

filtroVideo.addEventListener("change", () => {
  estado.soloConVideo = filtroVideo.checked;
  filtrarConceptos();
});

limpiarFiltros.addEventListener("click", () => {
  buscador.value = "";
  buscadorCampos.value = "";
  estado.camposSemanticosSeleccionados.clear();
  estado.tipoVariacion = "todas";
  estado.soloConVideo = false;
  filtroVariacion.value = "todas";
  filtroVideo.checked = false;
  selectorCampos.open = false;
  actualizarPresentacionCampos();
  filtrarConceptos();
});

iniciar();
