// Configuración de Supabase
const supabaseUrl = 'TU_URL_DEL_PROYECTO';
const supabaseKey = 'TU_API_KEY';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Variables globales
let currentGameId = null;
let currentTaskId = null;
let map;
let currentMarker = null;

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

// Iniciar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initMap);

async function createGame() {
    const gameName = document.getElementById('gameName').value;
    const gameDesc = document.getElementById('gameDesc').value;
    
    // Obtener usuario actual (necesitarás implementar login)
    const user = await supabase.auth.getUser();
    
    const { data, error } = await supabase
        .from('games')
        .insert({
            name: gameName,
            description: gameDesc,
            user_id: user.data.user.id
        })
        .select()
        .single();
    
    if(!error) {
        currentGameId = data.id;
        alert('Juego creado! ID: ' + currentGameId);
        document.getElementById('taskForm').style.display = 'block';
    }
}

function addClue() {
    const container = document.getElementById('cluesContainer');
    const newClue = document.createElement('div');
    newClue.className = 'clue';
    newClue.innerHTML = `
        <input type="text" placeholder="Pista ${container.children.length + 1}" class="clue-text">
        <input type="number" placeholder="Penalización" class="clue-penalty" min="1">
    `;
    container.appendChild(newClue);
}

async function saveTask() {
    // Recolectar datos del formulario
    const taskData = {
        game_id: currentGameId,
        type: document.getElementById('taskType').value,
        question: document.getElementById('taskQuestion').value,
        correct_answer: document.getElementById('correctAnswer').value,
        media_url: await uploadMedia()
    };

    // Guardar en Supabase
    const { data, error } = await supabase
        .from('tasks')
        .insert(taskData)
        .select()
        .single();
    
    if(!error) {
        currentTaskId = data.id;
        saveClues(currentTaskId);
        alert('Prueba guardada!');
    }
}

async function uploadMedia() {
    const file = document.getElementById('mediaFile').files[0];
    if(!file) return null;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
        .from('game-media')
        .upload(fileName, file);
    
    return data?.path ? `https://tu-proyecto.supabase.co/storage/v1/object/public/game-media/${fileName}` : null;
}

async function saveClues(taskId) {
    const clues = Array.from(document.querySelectorAll('.clue')).map(clue => ({
        task_id: taskId,
        clue_number: Array.from(clue.parentNode.children).indexOf(clue) + 1,
        clue_text: clue.querySelector('.clue-text').value,
        penalty: parseInt(clue.querySelector('.clue-penalty').value || 0)
    }));
    
    await supabase.from('clues').insert(clues);
}

// Variables de juego
let gameState = {
    currentTask: 0,
    score: 0,
    startTime: null,
    tasks: [],
    cluesUsed: []
};

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
    // ...
}

// Sistema de tareas
async function loadGame(gameId) {
    // Cargar datos del juego
    const { data: game } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();
    
    document.getElementById('gameTitle').textContent = game.name;
    
    // Cargar tareas
    const { data: tasks } = await supabase
        .from('tasks')
        .select(`
            *,
            clues(*)
        `)
        .eq('game_id', gameId)
        .order('created_at');
    
    gameState.tasks = tasks;
    updateTaskPanel();
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

// Validación de respuestas
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
            break;
    }
    
    if(isCorrect) {
        showTaskSuccess();
    } else {
        showError('Respuesta incorrecta');
    }
}

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

// Suscripción a cambios en tiempo real
function setupRealtime() {
    // Suscripción a cambios en tareas
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
// Compartir ubicación en tiempo real
function shareLocation(lat, lng) {
    supabase
        .from('player_positions')
        .insert({
            game_id: currentGameId,
            user_id: currentUser.id,
            lat,
            lng
        });
}

// Mostrar posiciones de otros jugadores
function updatePlayerMarkers() {
    supabase
        .from('player_positions')
        .select('*')
        .eq('game_id', currentGameId)
        .then(({ data }) => {
            data.forEach(player => {
                L.marker([player.lat, player.lng])
                    .bindPopup(player.user_id)
                    .addTo(map);
            });
        });
}

const supabase = supabase.createClient(ENV.SUPABASE_URL, ENV.SUPABASE_KEY);