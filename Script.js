/* ============ Utilidades ============ */
const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ============ Menú móvil ============ */
const burger = document.getElementById('burger');
const menu = document.getElementById('menu');

burger.addEventListener('click', () => {
    const abierto = menu.classList.toggle('abierto');
    burger.classList.toggle('abierto', abierto);
    burger.setAttribute('aria-expanded', abierto);
});
menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    menu.classList.remove('abierto');
    burger.classList.remove('abierto');
    burger.setAttribute('aria-expanded', false);
}));

/* ============ Barra de progreso y enlace activo ============ */
const progreso = document.getElementById('progreso');
const secciones = [...document.querySelectorAll('main section')];
const enlaces = [...menu.querySelectorAll('a')];

function alHacerScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progreso.style.width = (window.scrollY / max) * 100 + '%';

    const pos = window.scrollY + 140;
    let actual = secciones[0].id;
    secciones.forEach(s => { if (s.offsetTop <= pos) actual = s.id; });
    enlaces.forEach(a => a.classList.toggle('activo', a.getAttribute('href') === '#' + actual));
}
window.addEventListener('scroll', alHacerScroll, { passive: true });
alHacerScroll();

/* ============ Texto que se escribe solo ============ */
const frases = ['Desarrollador Junior Java & Spring Boot', 'Python Developer', 'Automatizaciones con n8n', 'Bases de datos SQL'];
const typed = document.getElementById('typed');

if (reducirMovimiento) {
    typed.textContent = frases[0];
} else {
    let f = 0, c = 0, borrando = false;
    (function escribir() {
        const frase = frases[f];
        typed.textContent = frase.slice(0, c);
        let espera = borrando ? 40 : 85;

        if (!borrando && c === frase.length) { borrando = true; espera = 1600; }
        else if (borrando && c === 0) { borrando = false; f = (f + 1) % frases.length; espera = 400; }
        else { c += borrando ? -1 : 1; }

        setTimeout(escribir, espera);
    })();
}

/* ============ Aparecer al hacer scroll + contadores + barras ============ */
function contar(el) {
    const meta = +el.dataset.contar;
    let n = 0;
    const paso = setInterval(() => {
        n++;
        el.textContent = n;
        if (n >= meta) clearInterval(paso);
    }, 180);
}

const observador = new IntersectionObserver(entradas => {
    entradas.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('visible');
        e.target.querySelectorAll('[data-contar]').forEach(contar);
        e.target.querySelectorAll('.barra-nivel').forEach(b => b.style.width = b.dataset.nivel + '%');
        observador.unobserve(e.target);
    });
}, { threshold: 0.15 });

document.querySelectorAll('.reveal').forEach(el => observador.observe(el));

/* ============ Tarjetas con inclinación 3D ============ */
if (!reducirMovimiento && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.tilt').forEach(card => {
        card.addEventListener('mousemove', e => {
            const r = card.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width - 0.5;
            const y = (e.clientY - r.top) / r.height - 0.5;
            card.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-6px)`;
        });
        card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
}

/* ============ Cubo 3D de tecnologías ============ */
const cubo = document.getElementById('cubo');
const escena = document.getElementById('escena');
let rotX = -20, rotY = 30, objX = -20, objY = 30, sobreCubo = false;

escena.addEventListener('mousemove', e => {
    const r = escena.getBoundingClientRect();
    objY = ((e.clientX - r.left) / r.width - 0.5) * 360;
    objX = -((e.clientY - r.top) / r.height - 0.5) * 360;
    sobreCubo = true;
});
escena.addEventListener('mouseleave', () => { sobreCubo = false; });

function animarCubo() {
    if (!sobreCubo && !reducirMovimiento) { objY += 0.45; objX = -20 + Math.sin(Date.now() / 1800) * 12; }
    rotX += (objX - rotX) * 0.08;
    rotY += (objY - rotY) * 0.08;
    cubo.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    requestAnimationFrame(animarCubo);
}
animarCubo();


/* ============ Carrusel 3D de metodología ============ */
(function carrusel3D() {
    const carrusel = document.getElementById('carrusel');
    if (!carrusel) return;
    const pasos = [...carrusel.children];
    const n = pasos.length;
    const zona = carrusel.closest('.carrusel-zona');
    let actual = 0, pausado = false, timer;

    function armar() {
        const ancho = carrusel.offsetWidth;
        const radio = Math.round((ancho / 2) / Math.tan(Math.PI / n)) + 30;
        pasos.forEach((p, i) => { p.style.transform = `rotateY(${i * (360 / n)}deg) translateZ(${radio}px)`; });
        carrusel.dataset.radio = radio;
        mover();
    }
    function mover() {
        const radio = carrusel.dataset.radio || 0;
        carrusel.style.transform = `translateZ(-${radio}px) rotateY(${-actual * (360 / n)}deg)`;
    }
    function ir(d) { actual += d; mover(); }

    function iniciar() {
        clearInterval(timer);
        if (reducirMovimiento) return;
        timer = setInterval(() => { if (!pausado) ir(1); }, 3200);
    }

    document.getElementById('siguiente').addEventListener('click', () => { ir(1); iniciar(); });
    document.getElementById('anterior').addEventListener('click', () => { ir(-1); iniciar(); });
    zona.addEventListener('mouseenter', () => pausado = true);
    zona.addEventListener('mouseleave', () => pausado = false);
    window.addEventListener('resize', armar);

    armar();
    iniciar();
})();

/* ============ Figura 3D junto a la foto (Three.js) ============ */
(function figura3D() {
    const canvas = document.getElementById('figura3d');
    if (typeof THREE === 'undefined' || !canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const escena3d = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camara.position.z = 9;

    const verde = 0x00e5a8, azul = 0x00a6ff;

    // Anillos que giran alrededor de la foto
    const anillos = new THREE.Group();
    [[2.9, verde, 0.9], [3.2, azul, 1.3]].forEach(([radio, color, inclinacion], i) => {
        const anillo = new THREE.Mesh(
            new THREE.TorusGeometry(radio, 0.02, 12, 120),
            new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
        );
        anillo.rotation.x = inclinacion;
        anillo.rotation.y = i * 1.2;
        anillos.add(anillo);
    });
    escena3d.add(anillos);

    // Figura flotante principal
    const figura = new THREE.Group();
    const ico = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.95, 1),
        new THREE.MeshBasicMaterial({ color: verde, wireframe: true })
    );
    const nucleo = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.55, 0),
        new THREE.MeshBasicMaterial({ color: azul, wireframe: true })
    );
    figura.add(ico, nucleo);
    figura.position.set(2.2, 2.3, 0.5);
    escena3d.add(figura);

    // Figura pequeña secundaria
    const octa = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.4),
        new THREE.MeshBasicMaterial({ color: azul, wireframe: true })
    );
    octa.position.set(-2.6, -2.3, 0.5);
    escena3d.add(octa);

    // Partículas
    const n = 90, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        const r = 3.4 + Math.random() * 1.6, a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI;
        pos[i * 3] = r * Math.sin(b) * Math.cos(a);
        pos[i * 3 + 1] = r * Math.cos(b);
        pos[i * 3 + 2] = r * Math.sin(b) * Math.sin(a);
    }
    const geoPart = new THREE.BufferGeometry();
    geoPart.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const particulas = new THREE.Points(geoPart, new THREE.PointsMaterial({ color: verde, size: 0.05 }));
    escena3d.add(particulas);

    function ajustar() {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        renderer.setSize(w, h, false);
        camara.aspect = w / h;
        camara.updateProjectionMatrix();
    }
    ajustar();
    window.addEventListener('resize', ajustar);

    // Reacciona suavemente al mouse
    let mx = 0, my = 0;
    window.addEventListener('mousemove', e => {
        mx = (e.clientX / window.innerWidth - 0.5) * 2;
        my = (e.clientY / window.innerHeight - 0.5) * 2;
    });

    const reloj = new THREE.Clock();
    function dibujar() {
        const t = reloj.getElapsedTime();
        if (!reducirMovimiento) {
            anillos.rotation.z = t * 0.25;
            anillos.rotation.y = t * 0.15;
            figura.rotation.x = t * 0.5;
            figura.rotation.y = t * 0.7;
            figura.position.y = 2.3 + Math.sin(t * 1.3) * 0.2;
            nucleo.rotation.y = -t * 1.4;
            octa.rotation.x = t * 0.9;
            octa.rotation.y = t * 0.6;
            octa.position.y = -2.3 + Math.cos(t * 1.1) * 0.15;
            particulas.rotation.y = t * 0.05;
        }
        escena3d.rotation.y += (mx * 0.35 - escena3d.rotation.y) * 0.05;
        escena3d.rotation.x += (my * 0.25 - escena3d.rotation.x) * 0.05;
        renderer.render(escena3d, camara);
        requestAnimationFrame(dibujar);
    }
    dibujar();
})();

/* ============ Formulario de mensajes (Web3Forms) ============ */
const form = document.getElementById('formulario');
const estado = document.getElementById('estado');
const botonEnviar = document.getElementById('enviar');

function validarCampo(input) {
    const campo = input.closest('.campo');
    const error = campo.querySelector('.error');
    const valor = input.value.trim();
    let msg = '';

    if (!valor) msg = 'Este campo es obligatorio.';
    else if (input.name === 'nombre' && valor.length < 3) msg = 'Escribe tu nombre completo.';
    else if (input.name === 'telefono' && !/^\+?[0-9\s-]{7,15}$/.test(valor)) msg = 'Escribe un número válido (solo números).';
    else if (input.name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) msg = 'Escribe un correo válido, por ejemplo nombre@correo.com.';
    else if (input.name === 'mensaje' && valor.length < 10) msg = 'Cuéntame un poco más (mínimo 10 caracteres).';

    error.textContent = msg;
    campo.classList.toggle('invalido', !!msg);
    return !msg;
}

form.querySelectorAll('input[required], textarea[required]').forEach(input => {
    input.addEventListener('blur', () => validarCampo(input));
    input.addEventListener('input', () => { if (input.closest('.campo').classList.contains('invalido')) validarCampo(input); });
});

form.addEventListener('submit', async e => {
    e.preventDefault();
    estado.className = 'estado';
    estado.textContent = '';

    const validos = [...form.querySelectorAll('input[required], textarea[required]')].map(validarCampo);
    if (validos.includes(false)) return;

    if (form.access_key.value.startsWith('TU_ACCESS_KEY')) {
        estado.className = 'estado fallo';
        estado.textContent = 'Falta configurar la clave de Web3Forms en index.html.';
        return;
    }

    botonEnviar.disabled = true;
    botonEnviar.textContent = 'Enviando...';

    try {
        const respuesta = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        const datos = await respuesta.json();

        if (respuesta.ok && datos.success) {
            estado.className = 'estado ok';
            estado.textContent = '¡Mensaje enviado! Te responderé pronto.';
            form.reset();
        } else {
            throw new Error(datos.message || 'Error al enviar');
        }
    } catch (err) {
        estado.className = 'estado fallo';
        estado.textContent = 'No se pudo enviar el mensaje. Inténtalo de nuevo o escríbeme por correo.';
    } finally {
        botonEnviar.disabled = false;
        botonEnviar.textContent = 'Enviar mensaje';
    }
});