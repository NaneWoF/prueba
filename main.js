const qs = sel => document.querySelector(sel);

function switchAuth(showLogin) {
  if (showLogin) {
    qs("#auth-title").innerText = "Ingreso";
    qs("#login-form").style.display = '';
    qs("#register-form").style.display = 'none';
    qs("#toggle-auth").innerText = "¿No tienes cuenta? Regístrate aquí";
  } else {
    qs("#auth-title").innerText = "Registro";
    qs("#login-form").style.display = 'none';
    qs("#register-form").style.display = '';
    qs("#toggle-auth").innerText = "¿Ya tienes cuenta? Inicia sesión aquí";
  }
}

qs("#toggle-auth").onclick = e => {
  e.preventDefault();
  switchAuth(qs("#login-form").style.display !== "none");
};
switchAuth(true);
