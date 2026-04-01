/**
 * app.js — All client-side logic for the TodoList frontend.
 *
 * HOW IT WORKS (high-level):
 *
 *   1. On page load, check localStorage for a saved JWT access token.
 *      • If found  → show the main app and load the user's lists.
 *      • If absent → show the auth (login/register) screen.
 *
 *   2. The auth screen lets the user log in or create an account.
 *      Successful login stores the JWT access token, refresh token,
 *      and user email in localStorage.
 *
 *   3. The main app shows:
 *        Left sidebar  — the user's todo lists  (create / delete)
 *        Right panel   — items in the selected list (create / toggle / delete)
 *
 *   4. Every API request attaches the JWT via the Authorization header.
 *      If a request returns 401 Unauthorized we attempt a silent token
 *      refresh; if that also fails we log the user out.
 *
 * FILE STRUCTURE:
 *   • API helpers     — low-level fetch wrappers
 *   • Auth functions  — login, register, logout, token refresh
 *   • List functions  — load, create, delete lists
 *   • Item functions  — load, create, toggle, delete items
 *   • UI helpers      — show/hide sections, render DOM elements
 *   • Event wiring    — attaches all event listeners
 *   • Initialisation  — runs on page load
 */

"use strict";

/* ═══════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Base URL for every API call.
 * Points directly at the Go API server so requests work when the frontend
 * is served by a separate static server (e.g. `serve` on port 3000).
 */
const API_BASE = "http://localhost:8010/api";

/* localStorage key names — keeps key strings in one place */
const STORAGE_TOKEN = "todo_access_token";
const STORAGE_REFRESH_TOKEN = "todo_refresh_token";
const STORAGE_USER_EMAIL = "todo_user_email";

/* ═══════════════════════════════════════════════════════════════════════
   IN-MEMORY STATE
   A minimal state object that the rest of the app reads and mutates.
   ═══════════════════════════════════════════════════════════════════════ */

/** @type {{ lists: Array, selectedListId: string|null }} */
const state = {
	lists: [],           // All todo-list objects for the current user
	selectedListId: null // UUID of the list whose items are displayed
};

/* ═══════════════════════════════════════════════════════════════════════
   API HELPERS
   These are thin wrappers around the browser's fetch() API.
   They handle JSON serialisation / deserialisation and attach the
   Authorization header automatically.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Retrieve the stored JWT access token from localStorage.
 * Returns null when the user is not logged in.
 *
 * @returns {string|null}
 */
function getToken() {
	return localStorage.getItem(STORAGE_TOKEN);
}

/**
 * Perform a fetch request to the backend API.
 *
 * • Automatically sets Content-Type: application/json.
 * • Attaches the JWT access token in the Authorization header when
 *   `requiresAuth` is true (the default).
 * • On 401 responses, attempts a silent token refresh and retries.
 *   If the refresh also fails the user is logged out.
 *
 * @param {string}  path         - API path, e.g. "/api/lists"
 * @param {string}  method       - HTTP method ("GET", "POST", "PUT", "DELETE")
 * @param {object}  [body]       - Request body, serialised to JSON
 * @param {boolean} [requiresAuth=true]  - Whether to add the Bearer token
 * @param {boolean} [isRetry=false]      - Internal flag, prevents infinite loops
 * @returns {Promise<{ok: boolean, status: number, data: any}>}
 *           Resolves with the parsed response body under `data`,
 *           or null when the response has no body (e.g. 204 No Content).
 */
async function apiFetch(path, method, body, requiresAuth = true, isRetry = false) {
	const headers = { "Content-Type": "application/json" };

	if (requiresAuth) {
		const token = getToken();
		if (token) {
			// The backend expects:  Authorization: Bearer <jwt>
			headers["Authorization"] = `Bearer ${token}`;
		}
	}

	const options = { method, headers };
	if (body !== undefined) {
		options.body = JSON.stringify(body);
	}

	const response = await fetch(API_BASE + path, options);

	// ── 401 Unauthorized ──────────────────────────────────────────────────
	// The JWT may have expired. Attempt to get a new one using the refresh
	// token, then retry the original request exactly once.
	if (response.status === 401 && !isRetry) {
		const refreshed = await refreshAccessToken();
		if (refreshed) {
			// Recurse with isRetry=true so we don't loop forever
			return apiFetch(path, method, body, requiresAuth, true);
		} else {
			// Refresh also failed — force the user to log in again
			logout();
			return { ok: false, status: 401, data: null };
		}
	}

	// ── Parse response body ───────────────────────────────────────────────
	// 204 No Content and some DELETEs return an empty body; guard against
	// trying to parse empty JSON.
	let data = null;
	const text = await response.text();
	if (text) {
		try {
			data = JSON.parse(text);
		} catch {
			data = text; // Return raw text if it is not valid JSON
		}
	}

	return { ok: response.ok, status: response.status, data };
}

/* ═══════════════════════════════════════════════════════════════════════
   AUTH FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Log the user in.
 *
 * Calls POST /api/login with email + password.
 * On success, stores the access token, refresh token, and email in
 * localStorage, then transitions to the main app view.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<string|null>} Error message string, or null on success.
 */
async function login(email, password) {
	const { ok, data } = await apiFetch(
		"/login",
		"POST",
		{ email, password },
		false // login itself does not need a prior token
	);

	if (!ok) {
		// The API returns { error: "…" } on failure
		return data?.error || "Login failed. Please check your credentials.";
	}

	// Persist credentials so the user stays logged in after a page refresh
	localStorage.setItem(STORAGE_TOKEN, data.token);
	localStorage.setItem(STORAGE_REFRESH_TOKEN, data.refresh_token);
	localStorage.setItem(STORAGE_USER_EMAIL, data.email);

	// Move to the main app
	showApp(data.email);
	await loadLists();
	return null; // null = no error
}

/**
 * Register a new account, then automatically log in.
 *
 * Calls POST /api/users with email + password.
 * On success, immediately calls login() so the user goes straight to the app.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<string|null>} Error message string, or null on success.
 */
async function register(email, password) {
	const { ok, data } = await apiFetch(
		"/users",
		"POST",
		{ email, password },
		false // registration does not need a prior token
	);

	if (!ok) {
		return data?.error || "Registration failed. That email may already be in use.";
	}

	// Account created — log in with the same credentials
	return login(email, password);
}

/**
 * Silently obtain a new JWT access token using the stored refresh token.
 *
 * Calls POST /api/refresh with the refresh token in the Authorization header.
 * If successful, overwrites the stored access token.
 *
 * @returns {Promise<boolean>} true if a new token was obtained, false otherwise.
 */
async function refreshAccessToken() {
	const refreshToken = localStorage.getItem(STORAGE_REFRESH_TOKEN);
	if (!refreshToken) return false;

	// The /api/refresh endpoint expects the *refresh* token, not the access token
	const response = await fetch(`${API_BASE}/refresh`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Authorization": `Bearer ${refreshToken}`
		}
	});

	if (!response.ok) return false;

	const data = await response.json();
	// Replace the expired access token with the new one
	localStorage.setItem(STORAGE_TOKEN, data.token);
	return true;
}

/**
 * Log the user out.
 *
 * Optionally revokes the refresh token on the server (best-effort — we don't
 * fail if this request errors), clears localStorage, and shows the auth screen.
 */
async function logout() {
	const refreshToken = localStorage.getItem(STORAGE_REFRESH_TOKEN);

	// Revoke the refresh token so it can't be used again, even after logout.
	// We fire-and-forget this; if it fails (e.g. network error) we still log out.
	if (refreshToken) {
		fetch(`${API_BASE}/revoke`, {
			method: "POST",
			headers: { "Authorization": `Bearer ${refreshToken}` }
		}).catch(() => { }); // swallow errors intentionally
	}

	// Clear all persisted auth data
	localStorage.removeItem(STORAGE_TOKEN);
	localStorage.removeItem(STORAGE_REFRESH_TOKEN);
	localStorage.removeItem(STORAGE_USER_EMAIL);

	// Reset in-memory state
	state.lists = [];
	state.selectedListId = null;

	// Return to the auth screen
	showAuth();
}

/* ═══════════════════════════════════════════════════════════════════════
   LIST FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Update the logged-in user's email and password.
 *
 * Calls PUT /api/users. The current email is read from localStorage so no
 * GET /api/users call is needed.
 *
 * @param {string} email    - New email address
 * @param {string} password - New password (plain text; hashed on the server)
 * @returns {Promise<string|null>} Error message string, or null on success.
 */
async function updateUser(email, password) {
  const { ok, data } = await apiFetch("/users", "PUT", { email, password });

  if (!ok) {
    return data?.error || "Could not update account.";
  }

  // Keep the stored email in sync with the new value
  localStorage.setItem(STORAGE_USER_EMAIL, data.email);
  document.getElementById("user-email").textContent = data.email;
  return null;
}

/**
 * Permanently delete the logged-in user's account.
 *
 * Calls DELETE /api/users, then logs the user out.
 *
 * @returns {Promise<string|null>} Error message string, or null on success.
 */
async function deleteUser() {
  const { ok, data } = await apiFetch("/users", "DELETE");

  if (!ok) {
    return data?.error || "Could not delete account.";
  }

  // Account deleted — clear session and return to auth screen
  await logout();
  return null;
}


/**
 * Fetch all todo lists for the logged-in user from GET /api/lists,
 * then re-render the sidebar.
 */
async function loadLists() {
	const { ok, data } = await apiFetch("/lists", "GET");

	if (!ok) {
		showListsError(data?.error || "Could not load lists.");
		return;
	}

	// data is an array of list objects: [{ id, name, user_id, … }, …]
	state.lists = data || [];
	renderLists();
}

/**
 * Create a new todo list.
 *
 * Calls POST /api/lists with the given name, then re-renders the sidebar
 * and auto-selects the newly created list.
 *
 * @param {string} name - Display name for the new list
 */
async function createList(name) {
	const { ok, data } = await apiFetch("/lists", "POST", { name });

	if (!ok) {
		showListsError(data?.error || "Could not create list.");
		return;
	}

	// Append to local state to avoid a full reload
	state.lists.push(data);
	renderLists();

	// Automatically open the newly created list
	selectList(data.id, data.name);
}

/**
 * Delete a todo list by its UUID.
 *
 * Calls DELETE /api/lists/{id}, then removes it from local state and
 * re-renders the sidebar.  If the deleted list was selected, the main
 * panel returns to the "select a list" placeholder.
 *
 * @param {string} listId - UUID of the list to delete
 */
async function deleteList(listId) {
	const { ok, data } = await apiFetch(`/lists/${listId}`, "DELETE");

	if (!ok) {
		showListsError(data?.error || "Could not delete list.");
		return;
	}

	// Remove from local state
	state.lists = state.lists.filter(l => l.id !== listId);

	// If the deleted list was being viewed, clear the main panel
	if (state.selectedListId === listId) {
		state.selectedListId = null;
		showNoListSelected();
	}

	renderLists();
}

/**
 * Rename a todo list.
 *
 * Calls PUT /api/lists with the list's id and new name, then updates local
 * state and re-renders the sidebar.
 *
 * @param {string} listId  - UUID of the list to rename
 * @param {string} newName - The new display name
 */
async function renameList(listId, newName) {
  const { ok, data } = await apiFetch("/lists", "PUT", { id: listId, name: newName });

  if (!ok) {
    showListsError(data?.error || "Could not rename list.");
    return;
  }

  // Update the name in local state
  const list = state.lists.find(l => l.id === listId);
  if (list) {
    list.name = data.name;
  }

  // If this list is currently selected, update the panel title too
  if (state.selectedListId === listId) {
    document.getElementById("selected-list-name").textContent = data.name;
  }

  renderLists();
}



/**
 * Fetch all items for a given list from GET /api/items?list_id=<id>,
 * then render them in the main panel.
 *
 * @param {string} listId - UUID of the parent list
 */
async function loadItems(listId) {
	const { ok, data } = await apiFetch(`/items?list_id=${listId}`, "GET");

	if (!ok) {
		showItemsError(data?.error || "Could not load items.");
		return;
	}

	// data is an array: [{ id, name, completed, list_id, … }, …]
	renderItems(data || []);
}

/**
 * Create a new item inside the currently selected list.
 *
 * Calls POST /api/items, then reloads the item list so the new item appears.
 *
 * @param {string} name - Display name for the new item
 */
async function createItem(name) {
	if (!state.selectedListId) return;

	const { ok, data } = await apiFetch("/items", "POST", {
		list_id: state.selectedListId,
		name,
		completed: false
	});

	if (!ok) {
		showItemsError(data?.error || "Could not create item.");
		return;
	}

	// Reload so the new item is shown with its server-assigned ID
	await loadItems(state.selectedListId);
}

/**
 * Toggle the completed state of an item.
 *
 * Calls PUT /api/items with the item's id, name, and the flipped
 * completed boolean, then reloads the item list.
 *
 * @param {string}  itemId    - UUID of the item
 * @param {string}  name      - Current name (required by the API)
 * @param {boolean} completed - Current completed value (will be flipped)
 */
async function toggleItem(itemId, name, completed) {
	const { ok, data } = await apiFetch("/items", "PUT", {
		id: itemId,
		name,
		completed: !completed // flip the completed flag
	});

	if (!ok) {
		showItemsError(data?.error || "Could not update item.");
		return;
	}

	// Reload to reflect the updated state from the server
	await loadItems(state.selectedListId);
}

/**
 * Delete an item by its UUID.
 *
 * Calls DELETE /api/items/{id}, then reloads the item list.
 *
 * @param {string} itemId - UUID of the item to delete
 */
async function deleteItem(itemId) {
	const { ok, data } = await apiFetch(`/items/${itemId}`, "DELETE");

	if (!ok) {
		showItemsError(data?.error || "Could not delete item.");
		return;
	}

	await loadItems(state.selectedListId);
}

/* ═══════════════════════════════════════════════════════════════════════
   UI RENDERING
   Functions that build and update DOM elements from state / data.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Re-render the sidebar list of todo lists from state.lists.
 * Clears the current contents and rebuilds from scratch.
 */
function renderLists() {
	const container = document.getElementById("lists-container");
	container.innerHTML = ""; // clear previous entries

	state.lists.forEach(list => {
		// <li class="list-item [active]">
		//   <span class="list-item-name">Name</span>
		//   <button class="btn btn-danger">✕</button>
		// </li>
		const li = document.createElement("li");
		li.className = "list-item" + (list.id === state.selectedListId ? " active" : "");
		li.dataset.id = list.id; // store UUID for event delegation

		const nameSpan = document.createElement("span");
		nameSpan.className = "list-item-name";
		nameSpan.textContent = list.name;

<<<<<<< HEAD
    // Inline rename input — shown when the user clicks the rename button
    const renameInput = document.createElement("input");
    renameInput.type      = "text";
    renameInput.className = "list-item-rename-input hidden";
    renameInput.value     = list.name;
    renameInput.setAttribute("aria-label", `Rename list "${list.name}"`);

    const renameBtn = document.createElement("button");
    renameBtn.className = "btn btn-secondary btn-sm";
    renameBtn.setAttribute("aria-label", `Rename list "${list.name}"`);
    renameBtn.textContent = "✎";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger btn-sm";
    deleteBtn.setAttribute("aria-label", `Delete list "${list.name}"`);
    deleteBtn.textContent = "✕";
=======
		const deleteBtn = document.createElement("button");
		deleteBtn.className = "btn btn-danger btn-sm";
		deleteBtn.setAttribute("aria-label", `Delete list "${list.name}"`);
		deleteBtn.textContent = "✕";
>>>>>>> adae53b (Update 8080 to 8010)

		// Clicking the name selects the list
		nameSpan.addEventListener("click", () => selectList(list.id, list.name));

<<<<<<< HEAD
    // Clicking ✎ switches to rename mode
    renameBtn.addEventListener("click", e => {
      e.stopPropagation();
      nameSpan.classList.add("hidden");
      renameBtn.classList.add("hidden");
      renameInput.classList.remove("hidden");
      renameInput.focus();
      renameInput.select();
    });

    // Confirm rename on Enter or blur
    const commitRename = async () => {
      const newName = renameInput.value.trim();
      renameInput.classList.add("hidden");
      nameSpan.classList.remove("hidden");
      renameBtn.classList.remove("hidden");
      if (newName && newName !== list.name) {
        await renameList(list.id, newName);
      }
    };
    renameInput.addEventListener("blur", commitRename);
    renameInput.addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); renameInput.blur(); }
      if (e.key === "Escape") { renameInput.value = list.name; renameInput.blur(); }
    });

    // Clicking ✕ deletes the list (stop propagation so it doesn't also select it)
    deleteBtn.addEventListener("click", e => {
      e.stopPropagation();
      deleteList(list.id);
    });

    li.appendChild(nameSpan);
    li.appendChild(renameInput);
    li.appendChild(renameBtn);
    li.appendChild(deleteBtn);
    container.appendChild(li);
  });
=======
		// Clicking ✕ deletes the list (stop propagation so it doesn't also select it)
		deleteBtn.addEventListener("click", e => {
			e.stopPropagation();
			deleteList(list.id);
		});

		li.appendChild(nameSpan);
		li.appendChild(deleteBtn);
		container.appendChild(li);
	});
>>>>>>> adae53b (Update 8080 to 8010)
}

/**
 * Render the todo items for the selected list.
 *
 * Each item row contains:
 *   • A checkbox  — toggling it calls toggleItem()
 *   • A name span — shows the item text, struck-through when completed
 *   • A delete button — calls deleteItem()
 *
 * @param {Array} items - Array of item objects from the API
 */
function renderItems(items) {
	const container = document.getElementById("items-container");
	container.innerHTML = ""; // clear previous entries

	if (items.length === 0) {
		const empty = document.createElement("li");
		empty.style.cssText = "color:var(--color-text-muted);font-size:var(--text-sm);padding:8px 0";
		empty.textContent = "No items yet. Add one above!";
		container.appendChild(empty);
		return;
	}

	items.forEach(item => {
		// <li class="item [completed]">
		//   <input type="checkbox" class="item-checkbox" [checked]>
		//   <span class="item-name">Name</span>
		//   <button class="btn btn-danger btn-sm">✕</button>
		// </li>
		const li = document.createElement("li");
		li.className = "item" + (item.completed ? " completed" : "");

		const checkbox = document.createElement("input");
		checkbox.type = "checkbox";
		checkbox.className = "item-checkbox";
		checkbox.checked = item.completed;
		checkbox.setAttribute("aria-label", `Mark "${item.name}" as ${item.completed ? "incomplete" : "complete"}`);

		// Toggling the checkbox flips the item's completed state on the server
		checkbox.addEventListener("change", () => {
			toggleItem(item.id, item.name, item.completed);
		});

		const nameSpan = document.createElement("span");
		nameSpan.className = "item-name";
		nameSpan.textContent = item.name;

		const deleteBtn = document.createElement("button");
		deleteBtn.className = "btn btn-danger btn-sm";
		deleteBtn.setAttribute("aria-label", `Delete item "${item.name}"`);
		deleteBtn.textContent = "✕";
		deleteBtn.addEventListener("click", () => deleteItem(item.id));

		li.appendChild(checkbox);
		li.appendChild(nameSpan);
		li.appendChild(deleteBtn);
		container.appendChild(li);
	});
}

/**
 * Select a list: update state, highlight it in the sidebar,
 * show the detail panel, and load its items.
 *
 * @param {string} listId   - UUID of the list to select
 * @param {string} listName - Display name to show as the panel title
 */
function selectList(listId, listName) {
	state.selectedListId = listId;

	// Update active highlight in the sidebar
	renderLists();

	// Show the detail panel and set its title
	document.getElementById("no-list-selected").classList.add("hidden");
	document.getElementById("list-detail").classList.remove("hidden");
	document.getElementById("selected-list-name").textContent = listName;

	// Clear any stale items and load fresh ones
	document.getElementById("items-container").innerHTML = "";
	clearItemsError();
	loadItems(listId);
}

/* ─────────────────────────────────────────────────────────────
   View-switching helpers
   ───────────────────────────────────────────────────────────── */

/** Show the auth section, hide the app section. */
function showAuth() {
	document.getElementById("auth-section").classList.remove("hidden");
	document.getElementById("app-section").classList.add("hidden");
	clearAuthError();
}

/**
 * Show the main app section, hide the auth section.
 * @param {string} email - User's email, displayed in the header.
 */
function showApp(email) {
	document.getElementById("auth-section").classList.add("hidden");
	document.getElementById("app-section").classList.remove("hidden");
	document.getElementById("user-email").textContent = email;
	showNoListSelected();
}

/** Show the "select a list" placeholder in the main panel. */
function showNoListSelected() {
	document.getElementById("no-list-selected").classList.remove("hidden");
	document.getElementById("list-detail").classList.add("hidden");
}

/* ─────────────────────────────────────────────────────────────
   Error-message helpers
   ───────────────────────────────────────────────────────────── */

function showAuthError(msg) {
	const el = document.getElementById("auth-error");
	el.textContent = msg;
	el.classList.remove("hidden");
}
function clearAuthError() {
	document.getElementById("auth-error").classList.add("hidden");
}

function showListsError(msg) {
	const el = document.getElementById("lists-error");
	el.textContent = msg;
	el.classList.remove("hidden");
}
function clearListsError() {
	document.getElementById("lists-error").classList.add("hidden");
}

function showItemsError(msg) {
	const el = document.getElementById("items-error");
	el.textContent = msg;
	el.classList.remove("hidden");
}
function clearItemsError() {
	document.getElementById("items-error").classList.add("hidden");
}

function showAccountError(msg) {
  const el = document.getElementById("account-error");
  el.textContent = msg;
  el.classList.remove("hidden");
  document.getElementById("account-success").classList.add("hidden");
}
function showAccountSuccess(msg) {
  const el = document.getElementById("account-success");
  el.textContent = msg;
  el.classList.remove("hidden");
  document.getElementById("account-error").classList.add("hidden");
}
function clearAccountMessages() {
  document.getElementById("account-error").classList.add("hidden");
  document.getElementById("account-success").classList.add("hidden");
}

/** Open the account settings panel and pre-populate the email field. */
function showAccountPanel() {
  const email = localStorage.getItem(STORAGE_USER_EMAIL) || "";
  document.getElementById("update-email").value = email;
  document.getElementById("update-password").value = "";
  document.getElementById("update-confirm").value = "";
  clearAccountMessages();
  document.getElementById("account-panel").classList.remove("hidden");
}

/** Close the account settings panel. */
function hideAccountPanel() {
  document.getElementById("account-panel").classList.add("hidden");
  clearAccountMessages();
}

/* ═══════════════════════════════════════════════════════════════════════
   EVENT WIRING
   Attach DOM event listeners to form submits and buttons.
   Called once after the DOM is ready.
   ═══════════════════════════════════════════════════════════════════════ */

function wireEvents() {

	/* ── Toggle between login and register forms ───────────────────────── */

	document.getElementById("show-register").addEventListener("click", () => {
		document.getElementById("login-form").classList.add("hidden");
		document.getElementById("register-form").classList.remove("hidden");
		clearAuthError();
	});

	document.getElementById("show-login").addEventListener("click", () => {
		document.getElementById("register-form").classList.add("hidden");
		document.getElementById("login-form").classList.remove("hidden");
		clearAuthError();
	});

	/* ── Login form submit ─────────────────────────────────────────────── */

	document.getElementById("login-form").addEventListener("submit", async e => {
		e.preventDefault(); // prevent the browser's default form submission
		clearAuthError();

		const email = document.getElementById("login-email").value.trim();
		const password = document.getElementById("login-password").value;

		const error = await login(email, password);
		if (error) showAuthError(error);
	});

	/* ── Register form submit ──────────────────────────────────────────── */

	document.getElementById("register-form").addEventListener("submit", async e => {
		e.preventDefault();
		clearAuthError();

		const email = document.getElementById("reg-email").value.trim();
		const password = document.getElementById("reg-password").value;
		const confirm = document.getElementById("reg-confirm").value;

		// Client-side validation: passwords must match before hitting the API
		if (password !== confirm) {
			showAuthError("Passwords do not match.");
			return;
		}

		const error = await register(email, password);
		if (error) showAuthError(error);
	});

	/* ── Logout button ─────────────────────────────────────────────────── */

	document.getElementById("logout-btn").addEventListener("click", logout);

<<<<<<< HEAD
  /* ── Account settings button ───────────────────────────────────────── */

  document.getElementById("account-btn").addEventListener("click", showAccountPanel);
  document.getElementById("close-account-btn").addEventListener("click", hideAccountPanel);

  /* ── Update user form submit ───────────────────────────────────────── */

  document.getElementById("update-user-form").addEventListener("submit", async e => {
    e.preventDefault();
    clearAccountMessages();

    const email    = document.getElementById("update-email").value.trim();
    const password = document.getElementById("update-password").value;
    const confirm  = document.getElementById("update-confirm").value;

    if (password !== confirm) {
      showAccountError("Passwords do not match.");
      return;
    }

    const error = await updateUser(email, password);
    if (error) {
      showAccountError(error);
    } else {
      showAccountSuccess("Account updated successfully.");
      document.getElementById("update-password").value = "";
      document.getElementById("update-confirm").value  = "";
    }
  });

  /* ── Delete account button ─────────────────────────────────────────── */

  document.getElementById("delete-account-btn").addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete your account? This cannot be undone.")) {
      return;
    }
    const error = await deleteUser();
    if (error) showAccountError(error);
  });

  /* ── New list form submit ──────────────────────────────────────────── */
=======
	/* ── New list form submit ──────────────────────────────────────────── */
>>>>>>> adae53b (Update 8080 to 8010)

	document.getElementById("new-list-form").addEventListener("submit", async e => {
		e.preventDefault();
		clearListsError();

		const input = document.getElementById("new-list-name");
		const name = input.value.trim();
		if (!name) return;

		await createList(name);
		input.value = ""; // clear the input after submission
	});

	/* ── New item form submit ──────────────────────────────────────────── */

	document.getElementById("new-item-form").addEventListener("submit", async e => {
		e.preventDefault();
		clearItemsError();

		const input = document.getElementById("new-item-name");
		const name = input.value.trim();
		if (!name) return;

		await createItem(name);
		input.value = ""; // clear the input after submission
	});
}

/* ═══════════════════════════════════════════════════════════════════════
   INITIALISATION
   Entry point: runs automatically when the script is executed.
   ═══════════════════════════════════════════════════════════════════════ */

(function init() {
	// Attach all event listeners
	wireEvents();

	// Check if the user already has a valid session persisted in localStorage.
	const token = getToken();
	const email = localStorage.getItem(STORAGE_USER_EMAIL);

	if (token && email) {
		// Session found — go straight to the app and load their lists.
		// If the token is expired, apiFetch will automatically refresh it on
		// the first API call; if refresh also fails the user will be logged out.
		showApp(email);
		loadLists();
	} else {
		// No session — show the login/register screen.
		showAuth();
	}
})();
