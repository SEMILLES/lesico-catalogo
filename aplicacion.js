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
};

const listaConceptos = document.querySelector("#lista-conceptos");
const panelDetalle = document.querySelector("#panel-detalle");
const buscador = document.querySelector("#buscador");
const contadorResultados = document.querySelector("#contador-resultados");
const fechaActualizacion = document.querySelector("#fecha-actualizacion");
const resumenCatalogo = document.querySelector("#resumen-catalogo");

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
    return { numero: "Sin clasificar", letra: id };
  }
  return { numero: coincidencia[1], letra: coincidencia[2].toLowerCase() };
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

  return normalizarBusqueda(partes.filter(tieneDato).join(" "));
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
    if (!consulta) return true;
    return concepto._textoBusqueda.includes(consulta);
  });
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
    }
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
iniciar();
