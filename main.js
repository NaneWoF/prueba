import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-app.js";
import { getDatabase, ref, get, onValue, set } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB4OFajtU-bKi7wuN5B1N_1x71hDo4nf8U",
  authDomain: "alarmaswof.firebaseapp.com",
  databaseURL: "https://alarmaswof-default-rtdb.firebaseio.com",
  projectId: "alarmaswof",
  storageBucket: "alarmaswof.appspot.com",
  messagingSenderId: "xxxx",
  appId: "1:xxxx:web:xxxx"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let deviceID = null;

window.login = function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  signInWithEmailAndPassword(auth, email, password)
    .then(() => console.log("Autenticado"))
    .catch(e => alert("Error de autenticación: " + e.message));
};

onAuthStateChanged(auth, user => {
  if (user) {
    const emailKey = user.email.replace(/\./g, "_");
    get(ref(db, `/relacionesUsuarios/${emailKey}`)).then(snapshot => {
      if (snapshot.exists()) {
        deviceID = snapshot.val();
        document.getElementById("loginBox").style.display = "none";
        document.getElementById("panel").style.display = "block";
        iniciarPanel(deviceID);
      } else {
        alert("Correo no asignado a ningún dispositivo.");
      }
    });
  }
});

function iniciarPanel(deviceID) {
  onValue(ref(db, `/dispositivos/${deviceID}/relay1`), snap => {
    document.getElementById("estado").textContent = snap.val() ? "ACTIVADA" : "DESACTIVADA";
  });
  onValue(ref(db, `/dispositivos/${deviceID}/salida`), snap => {
    const d = snap.val();
    if (d && d.nombre && d.direccion) {
      document.getElementById("usuario").textContent = `${d.nombre} (${d.direccion})`;
    } else {
      document.getElementById("usuario").textContent = "Desconocido";
    }
  });
}

window.solicitarIDWeb = function () {
  const id = prompt("Ingrese su ID Web");
  if (!id || !deviceID) return;

  get(ref(db, `/dispositivos/${deviceID}/transmisores`)).then(snapshot => {
    if (snapshot.exists()) {
      const lista = snapshot.val();
      const transmisores = Array.isArray(lista) ? lista : Object.values(lista);
      const match = transmisores.find(t => t.idWeb === id);
      if (match) {
        const relayRef = ref(db, `/dispositivos/${deviceID}/relay1`);
        get(relayRef).then(snap => {
          const estadoActual = snap.val();
          set(relayRef, !estadoActual);
          set(ref(db, `/dispositivos/${deviceID}/salida`), {
            codigo: match.codigo,
            nombre: match.nombre,
            direccion: match.direccion,
            idWeb: match.idWeb,
            estado: !estadoActual,
            timestamp: Date.now()
          });
        });
      } else {
        alert("ID Web no registrado.");
      }
    }
  });
};
