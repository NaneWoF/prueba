const firebaseConfig = {
  apiKey: "AIzaSyB4OFajtU-bKi7wuN5B1N_1x71hDo4nf8U",
  authDomain: "alarmaswof.firebaseapp.com",
  databaseURL: "https://alarmaswof-default-rtdb.firebaseio.com",
  projectId: "alarmaswof",
  storageBucket: "alarmaswof.appspot.com",
  messagingSenderId: "xxxx",
  appId: "1:xxxx:web:xxxx"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// Utilidades DOM
const qs = sel => document.querySelector(sel);
const show = (id) => qs(id).style.display = '';
const hide = (id) => qs(id).style.display = 'none';
const setText = (id, txt) => { qs(id).innerHTML = txt; };

// Estado global
let currentUser = null;
let userData = null;
let currentDevice = null;
let isAdmin = false;

// Loader inicial
hide("#auth-section");
hide("#user-panel");
hide("#admin-panel");
show("#loader");

// --- Auth ---
function switchAuth(showLogin) {
  if (showLogin) {
    qs("#auth-title").innerText = "Ingreso";
    show("#login-form");
    hide("#register-form");
    qs("#toggle-auth").innerText = "¿No tienes cuenta? Regístrate aquí";
  } else {
    qs("#auth-title").innerText = "Registro";
    hide("#login-form");
    show("#register-form");
    qs("#toggle-auth").innerText = "¿Ya tienes cuenta? Inicia sesión aquí";
  }
  qs("#auth-error").innerText = "";
}
qs("#toggle-auth").onclick = e => {
  e.preventDefault();
  switchAuth(qs("#login-form").style.display !== "none");
};
switchAuth(true);

// --- LOGIN
qs("#login-form").onsubmit = async e => {
  e.preventDefault();
  const email = qs("#login-email").value;
  const pass = qs("#login-password").value;
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (err) {
    qs("#auth-error").innerText = "Correo o contraseña inválidos.";
  }
};

// --- REGISTRO
qs("#register-form").onsubmit = async e => {
  e.preventDefault();
  const name = qs("#reg-name").value.trim();
  const email = qs("#reg-email").value.trim();
  const address = qs("#reg-address").value.trim();
  const pass = qs("#reg-password").value;
  const deviceID = qs("#reg-deviceid").value.trim();

  if (!name || !address || !deviceID) {
    qs("#auth-error").innerText = "Todos los campos son obligatorios.";
    return;
  }

  // Validar que el DeviceID existe en Firebase
  try {
    const devSnap = await db.ref("dispositivos/" + deviceID).once("value");
    if (!devSnap.exists()) {
      qs("#auth-error").innerText = "El DeviceID no existe o no está registrado.";
      return;
    }

    await auth.createUserWithEmailAndPassword(email, pass);

    const userKey = email.replace(/\./g, "_");
    // Guarda usuario
    await db.ref("usuarios/" + userKey).set({ nombre: name, direccion: address, email });
    // Crea solicitud pendiente
    await db.ref("solicitudesPendientes/" + deviceID + "/" + userKey).set({
      nombre: name, direccion: address, email
    });

    await auth.signInWithEmailAndPassword(email, pass);

    alert("Registro exitoso. Espera la aprobación del administrador del dispositivo.");
  } catch (err) {
    qs("#auth-error").innerText = err.message;
  }
};

// --- Monitor auth state ---
auth.onAuthStateChanged(async user => {
  hide("#loader");
  if (user) {
    currentUser = user;
    await loadUserData();
  } else {
    show("#auth-section");
    hide("#user-panel");
    hide("#admin-panel");
    setText("#auth-error", "");
    currentUser = null;
    userData = null;
    currentDevice = null;
    isAdmin = false;
  }
});

// --- Load user data and show panel ---
async function loadUserData() {
  const emailKey = currentUser.email.replace(/\./g, "_");
  // Ver si ya es usuario de algún dispositivo
  const relSnap = await db.ref("relacionesUsuarios/" + emailKey).once("value");
  const relVal = relSnap.val();
  if (relVal) {
    const deviceIDs = Object.keys(relVal);
    currentDevice = deviceIDs[0];
  } else {
    currentDevice = null;
  }

  // ¿Es admin de algún dispositivo?
  const dispositivosSnap = await db.ref("dispositivos").orderByChild("admin").equalTo(emailKey).once("value");
  if (dispositivosSnap.exists()) {
    isAdmin = true;
    showAdminPanel(dispositivosSnap.val());
  } else if (currentDevice) {
    isAdmin = false;
    showUserPanel();
  } else {
    // ¿Pendiente de aprobación?
    let pendiente = false;
    const pendSnap = await db.ref("solicitudesPendientes").once("value");
    const pendData = pendSnap.val() || {};
    Object.keys(pendData).forEach(devID => {
      if (pendData[devID][emailKey]) pendiente = true;
    });

    if (pendiente) {
      setText("#auth-section", "<h2>Tu acceso está pendiente de aprobación por el administrador.</h2><button id='logout-btn' class='danger'>Cerrar sesión</button>");
      qs("#logout-btn").onclick = () => auth.signOut();
    } else {
      setText("#auth-section", "<h2>No tienes dispositivos asociados.<br>Pide a tu administrador que te agregue.</h2><button id='logout-btn' class='danger'>Cerrar sesión</button>");
      qs("#logout-btn").onclick = () => auth.signOut();
    }
  }
}

// --- Panel usuario ---
let salidaListener = null;

async function showUserPanel() {
  hide("#auth-section"); hide("#admin-panel"); show("#user-panel");

  // Remueve listener anterior si existe
  if (salidaListener) {
    db.ref("dispositivos/" + currentDevice + "/salida").off("value", salidaListener);
  }

  salidaListener = function(snapshot) {
    const devSalida = snapshot.val();
    setText("#user-status", `
      <b>Dispositivo:</b> ${currentDevice} <br>
      <b>Última salida:</b> ${devSalida && devSalida.nombre ? devSalida.nombre + " (" + devSalida.direccion + ")" : "Sin registros"}
      <br><b>Estado actual:</b> <span style="color:${devSalida && devSalida.estado ? 'green':'red'}">${devSalida && devSalida.estado ? 'ACTIVADA':'DESACTIVADA'}</span>
    `);

    qs("#user-controls").innerHTML = `
      <button id="salida-btn">${devSalida && devSalida.estado ? 'Desactivar':'Activar'} salida</button>
    `;
    qs("#salida-btn").onclick = async () => {
      // Activar/desactivar salida y registrar usuario
      const estadoNuevo = !(devSalida && devSalida.estado);
      await db.ref("dispositivos/" + currentDevice + "/relay1").set(estadoNuevo);
      await db.ref("dispositivos/" + currentDevice + "/salida").set({
        estado: estadoNuevo,
        nombre: userData && userData.nombre ? userData.nombre : currentUser.email,
        direccion: userData && userData.direccion ? userData.direccion : "",
        timestamp: Date.now()
      });
    };
  };

  db.ref("dispositivos/" + currentDevice + "/salida").on("value", salidaListener);

  qs("#logout-btn").onclick = () => {
    if (salidaListener) {
      db.ref("dispositivos/" + currentDevice + "/salida").off("value", salidaListener);
    }
    auth.signOut();
  };
}

let adminDeviceListener = null; // Para guardar referencia y quitarlo

function showAdminPanel(dispositivos) {
  hide("#auth-section"); hide("#user-panel"); show("#admin-panel");
  const devList = Object.keys(dispositivos);
  let selHtml = "";
  devList.forEach(did => {
    selHtml += `<option value="${did}">${did}</option>`;
  });
  qs("#admin-device-list").innerHTML = selHtml;
  currentDevice = devList[0];
  showAdminDevice(currentDevice);

  qs("#admin-device-list").onchange = e => {
    currentDevice = e.target.value;
    showAdminDevice(currentDevice);
  };
  qs("#logout-btn-admin").onclick = () => auth.signOut();
}

function showAdminDevice(devID) {
  // Quitar listener anterior si existe
  if (adminDeviceListener) {
    db.ref("dispositivos/" + devID).off("value", adminDeviceListener);
    adminDeviceListener = null;
  }

  // Listener en tiempo real
  adminDeviceListener = db.ref("dispositivos/" + devID).on("value", (devSnap) => {
    const dev = devSnap.val();
    setText("#admin-status", `
      <b>Dispositivo:</b> ${devID}<br>
      <b>Administrador:</b> ${dev && dev.admin ? dev.admin.replace(/_/g, ".") : ""}<br>
      <b>Última salida:</b> ${dev && dev.salida && dev.salida.nombre ? dev.salida.nombre + " (" + dev.salida.direccion + ")" : "Sin registros"}
      <br><b>Estado actual:</b> <span style="color:${dev && dev.salida && dev.salida.estado ? 'green':'red'}">${dev && dev.salida && dev.salida.estado ? 'ACTIVADA':'DESACTIVADA'}</span>
    `);

    // --- Botón solicitudes (solo se crea una vez)
    if (!qs("#view-requests-btn")) {
      const btn = document.createElement("button");
      btn.id = "view-requests-btn";
      btn.textContent = "Solicitudes de acceso";
      btn.onclick = () => showSolicitudesPendientes(devID);
      qs("#admin-panel").insertBefore(btn, qs("#admin-panel").children[4]);
    } else {
      qs("#view-requests-btn").onclick = () => showSolicitudesPendientes(devID);
    }

    // --- Usuarios
    qs("#add-user-btn").onclick = async () => {
      const usuariosSnap = await db.ref("usuarios").once("value");
      const usuarios = usuariosSnap.val() || {};
      let selectHtml = "<select id='user-to-add'>";
      Object.keys(usuarios).forEach(uid => {
        if (!dev.usuarios || !dev.usuarios[uid]) {
          selectHtml += `<option value="${uid}">${usuarios[uid].nombre} (${usuarios[uid].email})</option>`;
        }
      });
      selectHtml += "</select>";
      setText("#admin-sections", `
        <h3>Agregar usuario al dispositivo</h3>
        ${selectHtml}
        <button id="confirm-add-user">Agregar</button>
        <button id="cancel-admin-section">Cancelar</button>
      `);
      qs("#confirm-add-user").onclick = async () => {
        const newUser = qs("#user-to-add").value;
        await db.ref("dispositivos/" + devID + "/usuarios/" + newUser).set(true);
        await db.ref("relacionesUsuarios/" + newUser + "/" + devID).set(true);
        setText("#admin-sections", "<b>Usuario agregado!</b>");
        setTimeout(() => showAdminDevice(devID), 1500);
      };
      qs("#cancel-admin-section").onclick = () => setText("#admin-sections", "");
    };

    // --- Gestionar usuarios
    qs("#manage-users-btn").onclick = () => {
      let listHtml = "<h3>Usuarios actuales</h3><ul>";
      if (dev.usuarios) {
        Object.keys(dev.usuarios).forEach(uid => {
          listHtml += `<li>${uid.replace(/_/g, ".")}
            <button class="danger" data-uid="${uid}">Quitar</button>
          </li>`;
        });
      }
      listHtml += "</ul><button id='cancel-admin-section'>Cerrar</button>";
      setText("#admin-sections", listHtml);
      document.querySelectorAll("#admin-sections button.danger").forEach(btn => {
        btn.onclick = async e => {
          const uid = e.target.getAttribute("data-uid");
          await db.ref("dispositivos/" + devID + "/usuarios/" + uid).remove();
          await db.ref("relacionesUsuarios/" + uid + "/" + devID).remove();
          showAdminDevice(devID);
        };
      });
      qs("#cancel-admin-section").onclick = () => setText("#admin-sections", "");
    };

    // --- Gestionar transmisores
    qs("#manage-transmitters-btn").onclick = async () => {
      const trans = dev.transmisores || [];
      let tHtml = "<h3>Transmisores</h3><ul>";
      trans.forEach((t, i) => {
        tHtml += `<li>
          <b>${t.nombre || "Sin nombre"}</b> - ${t.direccion || ""} <br>
          Código: ${t.codigo} 
          <button class="danger" data-idx="${i}">Eliminar</button>
          <button class="edit" data-idx="${i}">Editar</button>
        </li>`;
      });
      tHtml += "</ul><button id='add-trans-btn'>Agregar transmisor</button>";
      tHtml += "<button id='cancel-admin-section'>Cerrar</button>";
      setText("#admin-sections", tHtml);

      // Eliminar transmisor
      document.querySelectorAll("#admin-sections button.danger").forEach(btn => {
        btn.onclick = async e => {
          const idx = btn.getAttribute("data-idx");
          trans.splice(idx, 1);
          await db.ref("dispositivos/" + devID + "/transmisores").set(trans);
          showAdminDevice(devID);
        };
      });

      // Editar transmisor
      document.querySelectorAll("#admin-sections button.edit").forEach(btn => {
        btn.onclick = e => {
          const idx = btn.getAttribute("data-idx");
          const t = trans[idx];
          setText("#admin-sections", `
            <h3>Editar transmisor</h3>
            <input type="text" id="edit-t-name" value="${t.nombre || ""}" placeholder="Nombre">
            <input type="text" id="edit-t-dir" value="${t.direccion || ""}" placeholder="Dirección">
            <button id="save-edit-trans">Guardar</button>
            <button id="cancel-admin-section">Cancelar</button>
          `);
          qs("#save-edit-trans").onclick = async () => {
            t.nombre = qs("#edit-t-name").value;
            t.direccion = qs("#edit-t-dir").value;
            trans[idx] = t;
            await db.ref("dispositivos/" + devID + "/transmisores").set(trans);
            showAdminDevice(devID);
          };
          qs("#cancel-admin-section").onclick = () => showAdminDevice(devID);
        };
      });

      // Agregar transmisor
      qs("#add-trans-btn").onclick = async () => {
        await db.ref("dispositivos/" + devID + "/modoEscucha").set(true);
        setText("#admin-sections", `
          <h3>Modo escucha activado</h3>
          <p>Presiona el transmisor físico para capturar el código desde el equipo.<br>
          Espera la señal y luego completa los datos.</p>
          <button id="cancel-admin-section">Cancelar</button>
        `);
        qs("#cancel-admin-section").onclick = () => showAdminDevice(devID);
        db.ref("dispositivos/" + devID + "/codigoCapturado").on("value", async snap => {
          const codigo = snap.val();
          if (codigo && codigo !== 0) {
            setText("#admin-sections", `
              <h3>Nuevo transmisor detectado</h3>
              <form id="new-trans-form">
                <input type="text" id="new-t-name" placeholder="Nombre" required>
                <input type="text" id="new-t-dir" placeholder="Dirección" required>
                <input type="text" id="new-t-code" value="${codigo}" readonly>
                <button type="submit">Guardar</button>
                <button type="button" id="cancel-admin-section">Cancelar</button>
              </form>
            `);
            qs("#new-trans-form").onsubmit = async e => {
              e.preventDefault();
              trans.push({
                codigo: codigo,
                nombre: qs("#new-t-name").value,
                direccion: qs("#new-t-dir").value,
                idWeb: ""
              });
              await db.ref("dispositivos/" + devID + "/transmisores").set(trans);
              await db.ref("dispositivos/" + devID + "/codigoCapturado").set(0);
              showAdminDevice(devID);
            };
            qs("#cancel-admin-section").onclick = () => {
              db.ref("dispositivos/" + devID + "/codigoCapturado").set(0);
              showAdminDevice(devID);
            };
          }
        });
      };
      qs("#cancel-admin-section").onclick = () => setText("#admin-sections", "");
    };

    // --- Transferir administración ---
    qs("#admin-transfer-btn").onclick = async () => {
      let sel = "<select id='transfer-user'>";
      if (dev.usuarios) {
        Object.keys(dev.usuarios).forEach(uid => {
          if (uid !== dev.admin) {
            sel += `<option value="${uid}">${uid.replace(/_/g, ".")}</option>`;
          }
        });
      }
      sel += "</select>";
      setText("#admin-sections", `
        <h3>Transferir administración</h3>
        ${sel}
        <button id="confirm-transfer">Transferir</button>
        <button id="cancel-admin-section">Cancelar</button>
      `);
      qs("#confirm-transfer").onclick = async () => {
        const newAdmin = qs("#transfer-user").value;
        await db.ref("dispositivos/" + devID + "/admin").set(newAdmin);
        setText("#admin-sections", "<b>Transferencia exitosa.</b>");
        setTimeout(() => showAdminDevice(devID), 1500);
      };
      qs("#cancel-admin-section").onclick = () => setText("#admin-sections", "");
    };
  });
}

// --- Solicitudes pendientes ---
async function showSolicitudesPendientes(devID) {
  const reqSnap = await db.ref("solicitudesPendientes/" + devID).once("value");
  const reqs = reqSnap.val() || {};
  let html = "<h3>Solicitudes pendientes</h3>";
  if (Object.keys(reqs).length === 0) html += "<p>No hay solicitudes pendientes.</p>";
  else {
    html += "<ul>";
    Object.keys(reqs).forEach(uid => {
      html += `<li>
        <b>${reqs[uid].nombre}</b> (${reqs[uid].email}) - ${reqs[uid].direccion}
        <button data-uid="${uid}" class="approve-btn">Aprobar</button>
        <button data-uid="${uid}" class="danger reject-btn">Rechazar</button>
      </li>`;
    });
    html += "</ul>";
  }
  html += "<button id='cancel-admin-section'>Cerrar</button>";
  setText("#admin-sections", html);

  document.querySelectorAll(".approve-btn").forEach(btn => {
    btn.onclick = async e => {
      const uid = btn.getAttribute("data-uid");
      await db.ref("dispositivos/" + devID + "/usuarios/" + uid).set(true);
      await db.ref("relacionesUsuarios/" + uid + "/" + devID).set(true);
      await db.ref("solicitudesPendientes/" + devID + "/" + uid).remove();
      showAdminDevice(devID);
    };
  });
  document.querySelectorAll(".reject-btn").forEach(btn => {
    btn.onclick = async e => {
      const uid = btn.getAttribute("data-uid");
      await db.ref("solicitudesPendientes/" + devID + "/" + uid).remove();
      showAdminDevice(devID);
    };
  });
  qs("#cancel-admin-section").onclick = () => setText("#admin-sections", "");
}



