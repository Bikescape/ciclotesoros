// Configuración de Supabase
const supabaseUrl = 'https://uxyilkaoapjndmrzvmss.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV4eWlsa2FvYXBqbmRtcnp2bXNzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMwOTYyODQsImV4cCI6MjA2ODY3MjI4NH0.vt-puG5IeLfHiteXYHztWkTg99J55WjMSPD0CWkSCgE';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Variables globales
let currentGameId = null;
let currentTaskId = null;
let map;
let currentMarker = null;
let gameState = {
    currentTask: 0,
    score: 0,
    startTime: null,
    tasks: [],
    cluesUsed: []
};

// Inicializar el mapa
function initMap() {
    map = L.map('map').setView([40.4168, -3.7038], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    
    map.on('click', function(e) {
        if(currentTaskId) {
            const { lat, lng } = e.latlng;
            if(currentMarker) currentMarker.remove();
            currentMarker = L.marker([lat, lng]).addTo(map);
            
            // Guardar ubicación en la tarea
            updateTaskLocation(currentTaskId, lat, lng);
        }
    });
}

// Inicializar geolocalización
function initGeolocation() {
    if(navigator.geolocation) {
        navigator.geolocation.watchPosition(updatePosition, handleError, {
            enableHighAccuracy: true,
            maximumAge: 1000
        });
    }
}

function updatePosition(position) {
    const { latitude, longitude } = position.coords;
    map.setView([latitude, longitude], 18);
    
    // Verificar proximity con la tarea actual
    checkProximity(latitude, longitude);
}

async function checkProximity(lat, lng) {
    if(!gameState.tasks[gameState.currentTask]) return;
    
    const task = gameState.tasks[gameState.currentTask];
    if(task.type === 'location') {
        // Calcular distancia usando Haversine
        const distance = haversine(lat, lng, task.lat, task.lng);
        if(distance < 50) { // 50 metros
            showTaskSuccess();
        }
    }
}

function haversine(lat1, lon1, lat2, lon2) {
    // Implementación del algoritmo de Haversine
    const R = 6371e3; // Radio de la Tierra en metros
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

function handleError(error) {
    console.error('Error de geolocalización:', error);
    alert('No se pudo obtener tu ubicación. Asegúrate de permitir el acceso a la ubicación.');
}

// Sistema de autenticación
async function signIn() {
    const email = prompt('Email:');
    const password = prompt('Contraseña:');
    
    const { error } = await supabase.auth.signIn({ email, password });
    if(!error) location.reload();
}

async function signUp() {
    const email = prompt('Email:');
    const password = prompt('Contraseña:');
    
    const { error } = await supabase.auth.signUp({ email, password });
    if(!error) alert('Revisa tu email para confirmar');
}

async function signOut() {
    const { error } = await supabase.auth.signOut();
    if(!error) location.reload();
}

// Cargar información del usuario
async function loadUserInfo() {
    const { data: userData } = await supabase.auth.getUser();
    const userInfo = document.getElementById('userInfo');
    
    if (userData.user) {
        userInfo.innerHTML = `
            <p>Hola, ${userData.user.email}</p>
            <p>ID: ${userData.user.id}</p>
        `;
    } else {
        userInfo.innerHTML = '<p>No has iniciado sesión</p>';
    }
}

// Cargar lista de juegos
async function loadGames() {
    try {
        // Obtener usuario actual
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) {
            document.getElementById('gamesList').innerHTML = `
                <p>Debes iniciar sesión para ver tus juegos</p>
                <button onclick="signIn()" class="btn">Iniciar Sesión</button>
            `;
            return;
        }
        
        // Mostrar estado de carga
        document.getElementById('gamesList').innerHTML = '<div class="loading">Cargando juegos...</div>';
        
        // Cargar juegos del usuario
        const { data: games, error } = await supabase
            .from('games')
            .select('*')
            .eq('user_id', userData.user.id)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        // Mostrar juegos en la interfaz
        const gamesList = document.getElementById('gamesList');
        if (games && games.length > 0) {
            let html = '<h2>Mis Juegos</h2>';
            games.forEach(game => {
                html += `
                    <div class="game-card">
                        <h3>${game.name}</h3>
                        <p>${game.description || 'Sin descripción'}</p>
                        <button onclick="startGame('${game.id}')" class="btn">Jugar</button>
                    </div>
                `;
            });
            gamesList.innerHTML = html;
        } else {
            gamesList.innerHTML = `
                <p>No tienes juegos creados. Ve al Diseñador para crear uno.</p>
                <a href="designer.html" class="btn">Ir al Diseñador</a>
            `;
        }
    } catch (error) {
        console.error('Error cargando juegos:', error);
        document.getElementById('gamesList').innerHTML = `
            <p>Error al cargar los juegos: ${error.message}</p>
            <button onclick="loadGames()" class="btn">Reintentar</button>
        `;
    }
}

// Iniciar un juego
async function startGame(gameId) {
    currentGameId = gameId;
    
    // Ocultar lista de juegos y mostrar interfaz de juego
    document.getElementById('gamesList').style.display = 'none';
    document.getElementById('gameInterface').style.display = 'block';
    
    // Cargar datos del juego
    const { data: game } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();
    
    if (game) {
        document.getElementById('gameTitle').textContent = game.name;
    }
    
    // Cargar tareas del juego
    const { data: tasks } = await supabase
        .from('tasks')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at');
    
    if (tasks) {
        gameState.tasks = tasks;
        updateTaskPanel();
    }
    
    // Iniciar el juego
    startTimer();
    initGeolocation();
}

// Función para mostrar la lista de juegos
function showGamesList() {
    document.getElementById('gamesList').style.display = 'block';
    document.getElementById('gameInterface').style.display = 'none';
}

// Sistema de tiempo
function startTimer() {
    gameState.startTime = Date.now();
    setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameState.startTime) / 1000);
        const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
        const seconds = (elapsed % 60).toString().padStart(2, '0');
        document.getElementById('timer').textContent = `${minutes}:${seconds}`;
    }, 1000);
}

// Actualizar panel de tarea
function updateTaskPanel() {
    const task = gameState.tasks[gameState.currentTask];
    if (!task) return;
    
    document.getElementById('taskTitle').textContent = `Prueba ${gameState.currentTask + 1}`;
    document.getElementById('taskNarrative').textContent = task.question;
    
    // Cargar media
    if (task.media_url) {
        const mediaContainer = document.getElementById('mediaContainer');
        if (task.media_url.includes('.jpg') || task.media_url.includes('.png')) {
            mediaContainer.innerHTML = `<img src="${task.media_url}" alt="Imagen de la prueba">`;
        } else if (task.media_url.includes('.mp3') || task.media_url.includes('.wav')) {
            mediaContainer.innerHTML = `<audio controls src="${task.media_url}"></audio>`;
        }
    }
    
    // Limpiar input de respuesta
    document.getElementById('answerInput').value = '';
}

// Mostrar pista
function showClue(clueNumber) {
    const task = gameState.tasks[gameState.currentTask];
    const clue = task.clues.find(c => c.clue_number === clueNumber);
    
    if (clue) {
        alert(`Pista ${clueNumber}: ${clue.clue_text}`);
        // Aplicar penalización
        gameState.score -= clue.penalty;
        document.getElementById('score').textContent = gameState.score;
    }
}

// Validar respuesta
async function submitAnswer() {
    const answer = document.getElementById('answerInput').value;
    const task = gameState.tasks[gameState.currentTask];
    
    // Validación según tipo de tarea
    let isCorrect = false;
    
    switch(task.type) {
        case 'location':
            // Ya validado por geofencing
            isCorrect = true;
            break;
        case 'multiple_choice':
            isCorrect = answer === task.correct_answer;
            break;
        case 'qr':
            // Validación por código QR (usando biblioteca jsQR)
            // Aquí iría la lógica para escanear QR
            break;
    }
    
    if(isCorrect) {
        showTaskSuccess();
    } else {
        showError('Respuesta incorrecta');
    }
}

function showTaskSuccess() {
    gameState.score += 100 - (Date.now() - gameState.startTime)/1000;
    document.getElementById('score').textContent = Math.round(gameState.score);
    
    // Avanzar a la siguiente tarea
    gameState.currentTask++;
    if (gameState.currentTask < gameState.tasks.length) {
        updateTaskPanel();
    } else {
        // Juego completado
        alert(`¡Juego completado! Puntuación final: ${Math.round(gameState.score)}`);
        showGamesList();
    }
}

function showError(message) {
    alert(message);
}

// Suscripción a cambios en tiempo real
function setupRealtime() {
    supabase
        .channel('tasks')
        .on('postgres_changes', 
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'tasks' 
            }, 
            payload => {
                if(payload.new.game_id === currentGameId) {
                    updateTaskState(payload.new);
                }
            }
        )
        .subscribe();
}

function updateTaskState(task) {
    // Actualizar la tarea en el estado del juego
    const index = gameState.tasks.findIndex(t => t.id === task.id);
    if (index !== -1) {
        gameState.tasks[index] = task;
    }
}

// Función para mostrar la clasificación
function showLeaderboard() {
    // Implementar sistema de clasificación
    alert('Clasificación (proximamente)');
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
    // Detectar en qué página estamos
    if (window.location.pathname.endsWith('index.html') || 
        window.location.pathname === '/') {
        // Ya está en index.html
    } else if (window.location.pathname.endsWith('designer.html')) {
        initMap();
        loadUserInfo();
    } else if (window.location.pathname.endsWith('player.html')) {
        initMap();
        initGeolocation();
        loadGames();
    }
});