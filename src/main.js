// --- GLOBAL APP STATE & NAVIGATION ---
const appState = {
    activeApp: localStorage.getItem('activeApp') || 'planner'
};

const navPlannerBtn = document.getElementById('nav-planner');
const navTrackerBtn = document.getElementById('nav-tracker');
const appPlannerContainer = document.getElementById('app-planner');
const appTrackerContainer = document.getElementById('app-tracker');

function switchApp(appName) {
    appState.activeApp = appName;
    localStorage.setItem('activeApp', appName);

    appPlannerContainer.classList.toggle('hidden', appName !== 'planner');
    appTrackerContainer.classList.toggle('hidden', appName !== 'tracker');

    navPlannerBtn.classList.toggle('bg-indigo-600', appName === 'planner');
    navPlannerBtn.classList.toggle('text-white', appName === 'planner');
    navPlannerBtn.classList.toggle('shadow-lg', appName === 'planner');
    navPlannerBtn.classList.toggle('text-gray-500', appName !== 'planner');
    navPlannerBtn.classList.toggle('dark:text-gray-400', appName !== 'planner');
    navPlannerBtn.classList.toggle('hover:bg-gray-100', appName !== 'planner');
    navPlannerBtn.classList.toggle('dark:hover:bg-gray-700/50', appName !== 'planner');

    navTrackerBtn.classList.toggle('bg-indigo-600', appName === 'tracker');
    navTrackerBtn.classList.toggle('text-white', appName === 'tracker');
    navTrackerBtn.classList.toggle('shadow-lg', appName === 'tracker');
    navTrackerBtn.classList.toggle('text-gray-500', appName !== 'tracker');
    navTrackerBtn.classList.toggle('dark:text-gray-400', appName !== 'tracker');
    navTrackerBtn.classList.toggle('hover:bg-gray-100', appName !== 'tracker');
    navTrackerBtn.classList.toggle('dark:hover:bg-gray-700/50', appName !== 'tracker');
}

navPlannerBtn.addEventListener('click', () => switchApp('planner'));
navTrackerBtn.addEventListener('click', () => switchApp('tracker'));

// --- THEME MANAGEMENT (GLOBAL) ---
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const sunIcon = document.getElementById('theme-icon-sun');
const moonIcon = document.getElementById('theme-icon-moon');

function updateTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    sunIcon.classList.toggle('hidden', isDark);
    moonIcon.classList.toggle('hidden', !isDark);
}

function toggleTheme() {
    document.documentElement.classList.toggle('dark');
    localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    updateTheme();
}

themeToggleBtn.addEventListener('click', toggleTheme);

// --- MODAL HANDLING (GLOBAL) ---
const confirmationModal = document.getElementById('confirmation-modal');
let confirmationCallback = null;

function openConfirmationModal(message, onConfirm, options = {}) {
    const {
        title = "Are you sure?", confirmText = "Confirm", showCancel = true
    } = options;

    confirmationModal.querySelector('#confirmation-title').textContent = title;
    confirmationModal.querySelector('#confirmation-message').textContent = message;
    const confirmBtn = confirmationModal.querySelector('#confirmation-confirm-btn');
    const cancelBtn = confirmationModal.querySelector('#confirmation-cancel-btn');

    confirmBtn.textContent = confirmText;
    cancelBtn.classList.toggle('hidden', !showCancel);

    confirmationModal.classList.remove('hidden');
    confirmationCallback = onConfirm;
}

function closeConfirmationModal() {
    confirmationModal.classList.add('hidden');
    confirmationCallback = null;
}

document.getElementById('confirmation-confirm-btn').addEventListener('click', () => {
    if (confirmationCallback) confirmationCallback();
    closeConfirmationModal();
});
document.getElementById('confirmation-cancel-btn').addEventListener('click', closeConfirmationModal);

window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeConfirmationModal();
        closeWorkspaceModal();
        closeTaskDetailsModal();
        closeMediaPreview();
        closeSubscriptionModal();
    }
});

// ==================================================================
// --- EISENHOWER PLANNER LOGIC ---
// ==================================================================
window.eisenhowerPlannerAPI = (function eisenhowerPlanner() {
    let db;

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('eisenhowerPlannerDB', 1);
            request.onerror = event => reject('Database error: ' + event.target.errorCode);
            request.onsuccess = event => {
                db = event.target.result;
                resolve(db);
            };
            request.onupgradeneeded = event => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', {
                        keyPath: 'id'
                    });
                }
            };
        });
    }

    function saveFileToDB(fileData) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            const request = store.put(fileData);
            request.onsuccess = () => resolve();
            request.onerror = event => reject('Error saving file: ' + event.target.error);
        });
    }

    function getFileFromDB(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['files'], 'readonly');
            const store = transaction.objectStore('files');
            const request = store.get(id);
            request.onsuccess = event => resolve(event.target.result);
            request.onerror = event => reject('Error fetching file: ' + event.target.error);
        });
    }

    function deleteFileFromDB(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['files'], 'readwrite');
            const store = transaction.objectStore('files');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = event => reject('Error deleting file: ' + event.target.error);
        });
    }

    let appData = {};
    let uiState = {
        unsortedCollapsed: false,
        sortOptions: {},
        currentDate: new Date()
    };
    let editingTaskLocation = null;
    let draggedItem = null;
    let draggedSubtaskIndex = null;
    let currentPreviewUrl = null;
    let calendarDate = new Date();

    // Declare DOM element variables
    let appPlannerContainer, grid, workspaceManager, unsortedColumnWrapper, unsortedContainer,
        currentDateEl, todayBtn, prevDayBtn, nextDayBtn, calendarBtn, calendarPopover,
        monthYearEl, calendarGrid, prevMonthBtn, nextMonthBtn, workspaceModal,
        taskDetailsModal, mediaPreviewModal, workspaceInput, fileAttachmentInput,
        imagePreviewElement, videoPreviewElement, audioPreviewElement, pdfPreviewElement;

    const defaultTasks = {
        'unsorted': [],
        'urgent-important': [],
        'not-urgent-important': [],
        'urgent-not-important': [],
        'not-urgent-not-important': []
    };

    function getTodayDateString() {
        const today = new Date();
        return today.toISOString().split('T')[0];
    }

    function addTask(quadrantId, text) {
        const activeWS = appData.workspaces.find(ws => ws.id === appData.activeWorkspaceId);
        if (!activeWS) return;
        const dateStr = uiState.currentDate.toISOString().split('T')[0];
        if (!activeWS.tasks[dateStr]) {
            activeWS.tasks[dateStr] = JSON.parse(JSON.stringify(defaultTasks));
        }

        const newTask = {
            id: `task-${Date.now()}`,
            text: text,
            done: false,
            createdAt: dateStr,
            description: '',
            subTasks: [],
            attachments: [],
            deadline: null,
            status: 'draft'
        };

        activeWS.tasks[dateStr][quadrantId].push(newTask);
        saveData();
        renderTasks();
    }

    function loadData() {
        let data = JSON.parse(localStorage.getItem('eisenhowerPlannerV6'));
        if (!data || !data.workspaces || data.workspaces.length === 0) {
            const defaultId1 = `ws-${Date.now()}`;
            const today = getTodayDateString();
            appData = {
                activeWorkspaceId: defaultId1,
                workspaces: [{
                    id: defaultId1,
                    name: 'Daily Planner',
                    tasks: {
                        [today]: JSON.parse(JSON.stringify(defaultTasks))
                    }
                }]
            };
        } else {
            appData = data;
        }
        const storedUiState = JSON.parse(localStorage.getItem('eisenhowerUiStateV2'));
        if (storedUiState) {
            uiState = { ...uiState,
                ...storedUiState
            };
            uiState.currentDate = new Date(uiState.currentDate) || new Date();
            if (!uiState.sortOptions) uiState.sortOptions = {};
        }
        if (window.innerWidth < 768) uiState.unsortedCollapsed = true;
        saveData();
    }

    function saveData() {
        localStorage.setItem('eisenhowerPlannerV6', JSON.stringify(appData));
        localStorage.setItem('eisenhowerUiStateV2', JSON.stringify(uiState));
    }

    function applyUiState() {
        const unsortedQuadrant = document.getElementById('unsorted');
        if (!unsortedQuadrant) return;
        const desktopToggleBtn = document.getElementById('desktop-toggle-unsorted-btn');
        const mobileToggleBtn = unsortedQuadrant.querySelector('#toggle-unsorted-btn');
        const collapsibleContent = unsortedQuadrant.querySelector('.collapsible-content');
        const mobileToggleIcon = mobileToggleBtn.querySelector('svg');
        const desktopToggleIcon = desktopToggleBtn.querySelector('svg');

        if (window.innerWidth < 768) { // Mobile
            desktopToggleBtn.classList.add('hidden');
            mobileToggleBtn.classList.remove('hidden');
            unsortedColumnWrapper.classList.remove('md:w-16');
            unsortedContainer.classList.remove('hidden');

            if (uiState.unsortedCollapsed) {
                collapsibleContent.classList.add('hidden');
                mobileToggleIcon.classList.remove('rotate-180');
            } else {
                collapsibleContent.classList.remove('hidden');
                mobileToggleIcon.classList.add('rotate-180');
            }
        } else { // Desktop
            desktopToggleBtn.classList.remove('hidden');
            mobileToggleBtn.classList.add('hidden');
            collapsibleContent.classList.remove('hidden');

            if (uiState.unsortedCollapsed) {
                unsortedColumnWrapper.classList.remove('md:w-96');
                unsortedColumnWrapper.classList.add('md:w-3');
                unsortedContainer.classList.add('hidden');
                desktopToggleIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />';
            } else {
                unsortedColumnWrapper.classList.add('md:w-96');
                unsortedColumnWrapper.classList.remove('md:w-3');
                unsortedContainer.classList.remove('hidden');
                desktopToggleIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />';
            }
        }
    }

    function renderAllPlanner() {
        renderWorkspaces();
        renderQuadrants();
        renderTasks();
        renderDate();
        applyUiState();
    }

    function renderDate() {
        let options = {
            month: 'short',
            day: 'numeric'
        };
        if (window.innerWidth >= 768) {
            options = {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            };
        }
        currentDateEl.textContent = uiState.currentDate.toLocaleDateString(undefined, options);
    }

    function renderWorkspaces() {
        const activeWorkspace = appData.workspaces.find(ws => ws.id === appData.activeWorkspaceId);
        if (!activeWorkspace) {
            workspaceManager.innerHTML = '<div class="font-bold text-gray-900 dark:text-white">No Workspace</div>';
            return;
        }

        workspaceManager.innerHTML = `
                    <div class="relative" id="workspace-dropdown-container">
                        <button id="workspace-dropdown-btn" class="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/50 focus-ring">
                            <span class="font-semibold text-gray-900 dark:text-white truncate">${activeWorkspace.name}</span>
                           <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                        </button>
                        <div id="workspace-dropdown-menu" class="hidden absolute left-0 mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-20"></div>
                    </div>
                `;
        renderWorkspaceDropdown();
    }

    function renderWorkspaceDropdown() {
        const menu = document.getElementById('workspace-dropdown-menu');
        if (!menu) return;
        menu.innerHTML = `
                      <div class="p-2">
                          <p class="text-xs font-semibold text-gray-500 dark:text-gray-400 px-2 mb-1 uppercase tracking-wider">Switch Workspace</p>
                          <div id="workspace-dropdown-list" class="flex flex-col gap-1">
                              ${appData.workspaces.map(ws => `
                                  <div class="workspace-menu-item-group flex items-center justify-between group rounded-md ${ws.id === appData.activeWorkspaceId ? 'bg-indigo-100 dark:bg-indigo-600/30' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'}">
                                       <button data-id="${ws.id}" class="workspace-btn flex-grow text-left px-2 py-1.5 text-sm font-medium rounded-l-md ${ws.id === appData.activeWorkspaceId ? 'text-indigo-600 dark:text-white' : 'text-gray-800 dark:text-gray-300'}">
                                           ${ws.name}
                                       </button>
                                       <div class="sidebar-item-actions flex items-center pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button data-id="${ws.id}" class="edit-workspace-btn p-1.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600/80 focus-ring "><svg class="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>
                                            ${appData.workspaces.length > 1 ? `<button data-id="${ws.id}" class="delete-workspace-btn p-1.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600/80 focus-ring"><svg class="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
                                           </div>
                                  </div>
                              `).join('')}
                          </div>
                      </div>
                      <div class="border-t border-gray-200 dark:border-gray-700 p-2">
                          <button id="add-workspace-btn-dropdown" class="w-full text-left flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-300 text-sm font-medium focus-ring">
                              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                              <span>New Workspace</span>
                          </button>
                      </div>`;
    }

    function renderQuadrants() {
        const quadrantData = [{
            id: 'unsorted',
            title: 'Unsorted',
            desc: 'New tasks start here',
            color: 'text-gray-800 dark:text-gray-200',
            headerBg: 'bg-gray-200 dark:bg-gray-700',
            border: 'border-gray-400 dark:border-gray-500',
            hover: 'hover:bg-gray-300/50 dark:hover:bg-gray-600/50'
        }, {
            id: 'urgent-important',
            title: 'Urgent & Important',
            desc: 'Do it now',
            color: 'text-red-800 dark:text-red-200',
            headerBg: 'bg-red-200 dark:bg-red-500/20',
            border: 'border-red-400 dark:border-red-500',
            hover: 'hover:bg-red-300/50 dark:hover:bg-red-400/20'
        }, {
            id: 'not-urgent-important',
            title: 'Not Urgent & Important',
            desc: 'Schedule it',
            color: 'text-blue-800 dark:text-blue-200',
            headerBg: 'bg-blue-200 dark:bg-blue-500/20',
            border: 'border-blue-400 dark:border-blue-500',
            hover: 'hover:bg-blue-300/50 dark:hover:bg-blue-400/20'
        }, {
            id: 'urgent-not-important',
            title: 'Urgent & Not Important',
            desc: 'Delegate it',
            color: 'text-yellow-800 dark:text-yellow-200',
            headerBg: 'bg-yellow-200 dark:bg-yellow-500/20',
            border: 'border-yellow-400 dark:border-yellow-500',
            hover: 'hover:bg-yellow-300/50 dark:hover:bg-yellow-400/20'
        }, {
            id: 'not-urgent-not-important',
            title: 'Not Urgent & Not Important',
            desc: 'Eliminate it',
            color: 'text-green-800 dark:text-green-200',
            headerBg: 'bg-green-200 dark:bg-green-500/20',
            border: 'border-green-400 dark:border-green-500',
            hover: 'hover:bg-green-300/50 dark:hover:bg-green-400/20'
        }];

        grid.innerHTML = '';
        unsortedContainer.innerHTML = '';

        quadrantData.forEach((q) => {
            const quadrantEl = document.createElement('div');
            quadrantEl.id = q.id;
            const isUnsorted = q.id === 'unsorted';
            let quadrantClasses = `quadrant-container bg-white dark:bg-gray-800/60 rounded-2xl border border-gray-200 dark:border-gray-700/80 flex flex-col h-full shadow-sm`;
            quadrantEl.className = quadrantClasses;
            quadrantEl.innerHTML = `
                        <div class="flex justify-between items-center mb-3 p-3 rounded-t-2xl ${q.headerBg}">
                            <div>
                                <h2 class="text-base md:text-lg font-semibold ${q.color}">${q.title}</h2>
                                <p class="text-sm ${q.color} opacity-80">${q.desc}</p>
                            </div>
                            <div class="flex items-center gap-2 relative">
                                ${isUnsorted ? `<button id="toggle-unsorted-btn" title="Collapse" class="p-1 rounded-full hover:bg-black/10 text-gray-500 dark:text-gray-400 md:hidden"><svg class="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg></button>` : ''}
                            </div>
                        </div>
                        <div class="collapsible-content flex flex-col flex-grow min-h-0 px-4 pb-4">
                            <div class="past-tasks-container mb-4 border border-gray-300 dark:border-gray-700 rounded-lg hidden">
                                <button class="toggle-past-tasks-btn w-full flex justify-between items-center p-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
                                    <div class="flex items-center gap-2">
                                        <span>Previous Pending Tasks</span>
                                        <span class="past-task-count-badge bg-red-500 text-white text-xs rounded-full px-2 py-0.5"></span>
                                    </div>
                                    <svg class="w-4 h-4 transform transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                                </button>
                                <div class="past-tasks-list p-2 space-y-2 hidden">
                                    <p class="text-xs text-gray-500 dark:text-gray-400 px-2">Select tasks to move to today</p>
                                    <div class="past-task-items-container max-h-40 overflow-y-auto space-y-2"></div>
                                    <div class="flex gap-2 mt-2">
                                        <button class="move-selected-btn w-full px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus-ring">Move selected</button>
                                        <button class="move-all-btn w-full px-3 py-1 text-sm bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 focus-ring">Move all</button>
                                    </div>
                                </div>
                            </div>
                            <div class="tasks-container flex-grow overflow-y-auto space-y-2 pr-2"></div>
                             <div class="add-task-container mt-auto pt-4">
                                 <button class="add-task-btn w-full text-left flex items-center gap-2 p-2 rounded-lg border-2 border-dashed ${q.border} ${q.hover} ${q.color} opacity-60 hover:opacity-100 transition-opacity">
                                     <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H4a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd" /></svg>
                                     <span>Add a task</span>
                                 </button>
                                 <form class="add-task-form hidden" data-quadrant-id="${q.id}">
                                     <textarea class="new-task-input w-full bg-white dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 rounded-md p-2 focus-ring" placeholder="Type and press enter to save..."></textarea>
                                     <div class="flex items-center justify-end gap-2 mt-2">
                                         <button type="button" class="cancel-inline-task-btn px-3 py-1 text-sm bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 focus-ring">Cancel</button>
                                         <button type="button" class="save-inline-task-btn px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus-ring">Save</button>
                                     </div>
                                 </form>
                             </div>
                        </div>
                    `;

            if (isUnsorted) {
                unsortedContainer.appendChild(quadrantEl);
            } else {
                grid.appendChild(quadrantEl);
            }

            quadrantEl.addEventListener('dragover', e => {
                e.preventDefault();
                quadrantEl.classList.add('drag-over');
            });
            quadrantEl.addEventListener('dragleave', () => quadrantEl.classList.remove('drag-over'));
            quadrantEl.addEventListener('drop', e => {
                e.preventDefault();
                quadrantEl.classList.remove('drag-over');
                document.querySelectorAll('.task-drag-over-top, .task-drag-over-bottom').forEach(el => el.classList.remove('task-drag-over-top', 'task-drag-over-bottom'));

                if (!draggedItem) return;

                const activeWS = appData.workspaces.find(ws => ws.id === appData.activeWorkspaceId);
                const sourceQuadrantId = draggedItem.quadrantId;
                const targetQuadrantId = quadrantEl.id;
                const dateStr = uiState.currentDate.toISOString().split('T')[0];
                const sourceTasks = activeWS.tasks[dateStr][sourceQuadrantId];
                const targetTasks = activeWS.tasks[dateStr][targetQuadrantId];

                const taskData = sourceTasks.splice(draggedItem.taskIndex, 1)[0];

                const tasksContainer = quadrantEl.querySelector('.tasks-container');
                const targetElement = e.target.closest('.task-item');
                let dropIndex = targetTasks.length;

                if (targetElement && tasksContainer.contains(targetElement)) {
                    const rect = targetElement.getBoundingClientRect();
                    const midway = rect.top + (rect.height / 2);
                    dropIndex = parseInt(targetElement.dataset.index);
                    if (e.clientY > midway) dropIndex += 1;
                }

                if (sourceQuadrantId === targetQuadrantId && draggedItem.taskIndex < dropIndex) dropIndex--;

                targetTasks.splice(dropIndex, 0, taskData);

                saveData();
                renderTasks();
                draggedItem = null;
            });
        });
    }

    function sortTasks(tasks, sortOption) {
        const sortedTasks = [...tasks];
        switch (sortOption) {
            case 'name-asc':
                sortedTasks.sort((a, b) => a.text.localeCompare(b.text));
                break;
            case 'name-desc':
                sortedTasks.sort((a, b) => b.text.localeCompare(a.text));
                break;
        }
        return sortedTasks;
    }

    function getPastTasks(allTasks, quadrantId) {
        const currentDate = uiState.currentDate.toISOString().split('T')[0];
        const pastTasks = [];
        for (const date in allTasks) {
            if (date < currentDate) {
                const tasksForDate = allTasks[date];
                if (tasksForDate[quadrantId]) {
                    tasksForDate[quadrantId].forEach(task => {
                        if (!task.done) {
                            pastTasks.push({ ...task,
                                originalQuadrant: quadrantId,
                                originalDate: date
                            });
                        }
                    });
                }
            }
        }
        return pastTasks;
    }

    function renderPastTasks(quadrantId, allTasks) {
        const quadrantEl = document.getElementById(quadrantId);
        const pastTasksContainer = quadrantEl.querySelector('.past-tasks-container');
        const pastTasksList = pastTasksContainer.querySelector('.past-tasks-list');
        const pastTaskItemsContainer = pastTasksContainer.querySelector('.past-task-items-container');
        const badge = pastTasksContainer.querySelector('.past-task-count-badge');

        const pastTasks = getPastTasks(allTasks, quadrantId);

        if (pastTasks.length > 0) {
            pastTasksContainer.classList.remove('hidden');
            badge.textContent = pastTasks.length;
            pastTaskItemsContainer.innerHTML = '';
            pastTasks.forEach(task => {
                const div = document.createElement('div');
                div.className = "flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md";
                const [year, month, day] = task.createdAt.split('-');
                const taskDate = new Date(year, month - 1, day);
                const formattedDate = taskDate.toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short'
                }).toUpperCase();
                div.innerHTML = `
                            <label class="flex items-center gap-2 text-sm">
                                <input type="checkbox" class="past-task-checkbox" data-task-id="${task.id}" data-task-date="${task.createdAt}">
                                <span>${task.text}</span>
                            </label>
                            <span class="text-xs text-gray-500">${formattedDate}</span>
                        `;
                pastTaskItemsContainer.appendChild(div);
            });
        } else {
            pastTasksContainer.classList.add('hidden');
        }
    }

    function renderTasks() {
        const activeWorkspace = appData.workspaces.find(ws => ws.id === appData.activeWorkspaceId);
        if (!activeWorkspace) {
            grid.innerHTML = '';
            unsortedContainer.innerHTML = '';
            return;
        }
        const currentDateStr = uiState.currentDate.toISOString().split('T')[0];

        if (!activeWorkspace.tasks[currentDateStr]) {
            activeWorkspace.tasks[currentDateStr] = JSON.parse(JSON.stringify(defaultTasks));
        }

        for (const quadrantId in defaultTasks) {
            const container = document.getElementById(quadrantId);
            if (!container) continue;
            const tasksContainer = container.querySelector('.tasks-container');
            tasksContainer.innerHTML = '';

            const sortOption = uiState.sortOptions[quadrantId] || 'default';
            let taskList = (activeWorkspace.tasks[currentDateStr] && activeWorkspace.tasks[currentDateStr][quadrantId]) ? activeWorkspace.tasks[currentDateStr][quadrantId] : [];

            if (sortOption !== 'default') taskList = sortTasks(taskList, sortOption);

            if (taskList.length === 0) {
                tasksContainer.innerHTML = `<div class="flex-grow flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-600 opacity-50"><p class="text-sm font-medium mt-2">No tasks yet</p></div>`;
            } else {
                taskList.forEach((task, index) => {
                    const originalIndex = sortOption === 'default' ? index : (activeWorkspace.tasks[currentDateStr][quadrantId] || []).findIndex(t => t.id === task.id);
                    tasksContainer.appendChild(createTaskElement(task, quadrantId, originalIndex));
                });
            }
            renderPastTasks(quadrantId, activeWorkspace.tasks);
        }
    }

    function createTaskElement(task, quadrantId, index) {
        const div = document.createElement('div');
        div.className = 'task-item bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600/50 p-3 rounded-lg flex items-start justify-between group shadow-sm';
        div.dataset.quadrant = quadrantId;
        div.dataset.index = index;
        div.draggable = true;

        const hasDetails = task.description || (task.subTasks && task.subTasks.length > 0) || (task.attachments && task.attachments.length > 0) || task.deadline;
        const subtaskProgress = (task.subTasks && task.subTasks.length > 0) ? `${task.subTasks.filter(st => st.done).length}/${task.subTasks.length}` : '';
        const attachmentCount = (task.attachments && task.attachments.length > 0) ? task.attachments.length : 0;

        let deadlineHtml = '';
        if (task.deadline) {
            const deadlineDate = new Date(task.deadline);
            const isOverdue = deadlineDate < new Date() && !task.done;
            const formattedDeadline = deadlineDate.toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            const deadlineColor = isOverdue ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400';
            deadlineHtml = `
                        <span class="flex items-center gap-1 ${deadlineColor}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" />
                            </svg>
                            <span>${formattedDeadline}</span>
                        </span>`;
        }


        div.innerHTML = `
                        <div class="flex items-start gap-3 flex-grow min-w-0">
                            <input type="checkbox" class="task-checkbox h-5 w-5 mt-0.5 rounded border-gray-400 dark:border-gray-500 bg-gray-200 dark:bg-gray-700 text-indigo-500 flex-shrink-0 focus:ring-indigo-500">
                            <div class="task-details-trigger flex-grow min-w-0 cursor-pointer">
                                <div class="flex items-center gap-2">
                                    <p class="task-text text-sm flex-grow ${task.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-gray-200'}">${task.text}</p>
                                </div>
                                ${hasDetails ? `
                                <div class="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs mt-1">
                                    ${subtaskProgress ? `<span class="flex items-center gap-1 text-gray-500 dark:text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 5a2 2 0 002-2h10a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm2-1a1 1 0 00-1 1v2h12V5a1 1 0 00-1-1H5zM4 9v6a1 1 0 001 1h10a1 1 0 001-1V9H4z" clip-rule="evenodd" /></svg><span>${subtaskProgress}</span></span>` : ''}
                                    ${attachmentCount > 0 ? `<span class="flex items-center gap-1 text-gray-500 dark:text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a3 3 0 00-3 3v4a3 3 0 106 0V7a1 1 0 112 0v4a5 5 0 11-10 0V7a3 3 0 013-3z" clip-rule="evenodd" /></svg><span>${attachmentCount}</span></span>` : ''}
                                    ${deadlineHtml}
                                </div>` : ''}
                            </div>
                        </div>
                        <div class="task-actions flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 pl-2">
                            <button class="delete-btn p-1"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-500 dark:text-gray-400 hover:text-red-400"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
                        </div>`;

        div.querySelector('.task-checkbox').checked = task.done;
        div.querySelector('.task-details-trigger').addEventListener('click', () => openTaskDetailsModal(quadrantId, index));
        div.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openConfirmationModal('Are you sure you want to delete this task?', () => {
                const activeWS = appData.workspaces.find(ws => ws.id === appData.activeWorkspaceId);
                const dateStr = uiState.currentDate.toISOString().split('T')[0];
                activeWS.tasks[dateStr][quadrantId].splice(index, 1);
                saveData();
                renderTasks();
            });
        });

        div.addEventListener('dragstart', (e) => {
            if (e.target.matches('input, button, svg, path')) {
                e.preventDefault();
                return;
            }
            draggedItem = {
                workspaceId: appData.activeWorkspaceId,
                quadrantId,
                taskIndex: index,
                element: e.target
            };
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => div.classList.add('dragging'), 0);
        });
        div.addEventListener('dragend', () => div.classList.remove('dragging'));
        return div;
    };

    window.openWorkspaceModal = function(id = null) {
        const workspaceInput = document.getElementById('workspace-input');
        workspaceInput.value = '';
        workspaceModal.classList.remove('hidden');
        workspaceInput.focus();
        editingTaskLocation = { ...editingTaskLocation,
            editingWorkspaceId: id
        };
        if (id) {
            workspaceModal.querySelector('#workspace-modal-title').textContent = 'Edit Workspace';
            workspaceInput.value = appData.workspaces.find(ws => ws.id === id).name;
        } else {
            workspaceModal.querySelector('#workspace-modal-title').textContent = 'Add New Workspace';
        }
    };
    window.closeWorkspaceModal = function() {
        workspaceModal.classList.add('hidden');
        editingTaskLocation = { ...editingTaskLocation,
            editingWorkspaceId: null
        };
    };

    window.openTaskDetailsModal = function(quadrantId, index) {
        editingTaskLocation = {
            quadrantId,
            index
        };
        const task = appData.workspaces.find(ws => ws.id === appData.activeWorkspaceId).tasks[uiState.currentDate.toISOString().split('T')[0]][quadrantId][index];

        taskDetailsModal.querySelector('#task-details-title').value = task.text;
        taskDetailsModal.querySelector('#task-details-status').value = task.status || 'draft';
        taskDetailsModal.querySelector('#task-details-deadline').value = task.deadline || '';
        taskDetailsModal.querySelector('#task-details-description').value = task.description || '';
        renderSubTasks(task.subTasks);
        renderAttachments(task.attachments);

        taskDetailsModal.classList.remove('hidden');
    }

    window.closeTaskDetailsModal = function() {
        if (editingTaskLocation) {
            const {
                quadrantId,
                index
            } = editingTaskLocation;
            const activeWS = appData.workspaces.find(ws => ws.id === appData.activeWorkspaceId);
            const todayTasks = activeWS.tasks[uiState.currentDate.toISOString().split('T')[0]];
            if (todayTasks && todayTasks[quadrantId] && todayTasks[quadrantId][index]) {
                const task = todayTasks[quadrantId][index];
                task.text = taskDetailsModal.querySelector('#task-details-title').value.trim();
                task.status = taskDetailsModal.querySelector('#task-details-status').value;
                const deadlineValue = taskDetailsModal.querySelector('#task-details-deadline').value;
                task.deadline = deadlineValue ? deadlineValue : null;
                task.description = taskDetailsModal.querySelector('#task-details-description').value.trim();
                saveData();
                renderTasks();
            }
        }
        taskDetailsModal.classList.add('hidden');
        editingTaskLocation = null;
    }

    function closeMediaPreview() {
        mediaPreviewModal.classList.add('hidden');
        if (currentPreviewUrl) {
            URL.revokeObjectURL(currentPreviewUrl);
            currentPreviewUrl = null;
        }
        imagePreviewElement.classList.add('hidden');
        videoPreviewElement.classList.add('hidden');
        audioPreviewElement.classList.add('hidden');
        pdfPreviewElement.classList.add('hidden');
        imagePreviewElement.src = '';
        videoPreviewElement.src = '';
        audioPreviewElement.src = '';
        pdfPreviewElement.src = '';
    }

    async function openMediaPreview(attachment) {
        if (!db) {
            alert("Preview is not available as the database could not be initialized.");
            return;
        }
        try {
            const fileData = await getFileFromDB(attachment.id);
            if (!fileData || !fileData.file) {
                alert('Could not retrieve file for preview.');
                return;
            }
            const file = fileData.file;
            currentPreviewUrl = URL.createObjectURL(file);

            imagePreviewElement.classList.add('hidden');
            videoPreviewElement.classList.add('hidden');
            audioPreviewElement.classList.add('hidden');
            pdfPreviewElement.classList.add('hidden');

            if (file.type.startsWith('image/')) {
                imagePreviewElement.src = currentPreviewUrl;
                imagePreviewElement.classList.remove('hidden');
            } else if (file.type.startsWith('video/')) {
                videoPreviewElement.src = currentPreviewUrl;
                videoPreviewElement.classList.remove('hidden');
            } else if (file.type.startsWith('audio/')) {
                audioPreviewElement.src = currentPreviewUrl;
                audioPreviewElement.classList.remove('hidden');
            } else if (file.type === 'application/pdf') {
                pdfPreviewElement.src = currentPreviewUrl;
                pdfPreviewElement.classList.remove('hidden');
            } else {
                alert(`Preview is not supported for this file type: ${file.type}`);
                closeMediaPreview();
                return;
            }
            mediaPreviewModal.classList.remove('hidden');
        } catch (error) {
            console.error('Error opening media preview:', error);
            alert('An error occurred while trying to preview the file.');
        }
    }

    async function handlePreviewAttachment(index) {
        if (!editingTaskLocation) return;
        const { quadrantId, index: taskIndex } = editingTaskLocation;
        const activeWS = appData.workspaces.find(ws => ws.id === appData.activeWorkspaceId);
        const dateStr = uiState.currentDate.toISOString().split('T')[0];
        const task = activeWS.tasks[dateStr][quadrantId][taskIndex];
        const attachment = task.attachments[index];
        await openMediaPreview(attachment);
    }

    function handleDeleteAttachment(index) {
        if (!editingTaskLocation) return;

        openConfirmationModal('Are you sure you want to delete this attachment?', async () => {
            const { quadrantId, index: taskIndex } = editingTaskLocation;
            const activeWS = appData.workspaces.find(ws => ws.id === appData.activeWorkspaceId);
            const dateStr = uiState.currentDate.toISOString().split('T')[0];
            const task = activeWS.tasks[dateStr][quadrantId][taskIndex];
            const attachment = task.attachments[index];

            if (db) {
                try {
                    await deleteFileFromDB(attachment.id);
                } catch (error) {
                    console.error('Failed to delete file from DB:', error);
                    // Decide if you want to stop the process if DB deletion fails
                }
            }

            task.attachments.splice(index, 1);
            saveData();
            renderAttachments(task.attachments);
            renderTasks();
        });
    }

    async function handleFileAttachment(e) {
        if (!editingTaskLocation) return;

        const files = e.target.files;
        if (files.length === 0) return;

        const { quadrantId, index } = editingTaskLocation;
        const activeWS = appData.workspaces.find(ws => ws.id === appData.activeWorkspaceId);
        const dateStr = uiState.currentDate.toISOString().split('T')[0];
        const task = activeWS.tasks[dateStr][quadrantId][index];

        if (!task.attachments) {
            task.attachments = [];
        }

        for (const file of files) {
            const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const attachmentMeta = {
                id: fileId,
                name: file.name,
                type: file.type,
                size: file.size,
            };

            try {
                if (db) { // Only save to DB if it was initialized
                    await saveFileToDB({ id: fileId, file: file });
                }
                task.attachments.push(attachmentMeta);
            } catch (error) {
                console.error('Failed to save attachment:', error);
                alert('There was an error attaching the file. It will not be saved.');
                // Optionally remove the meta if save fails
                task.attachments = task.attachments.filter(att => att.id !== fileId);
            }
        }

        saveData();
        renderAttachments(task.attachments);
        renderTasks(); // To update attachment count on the task card

        // Clear the input so the user can attach the same file again if needed
        e.target.value = '';
    }

    function renderAttachments(attachments) {
        const container = taskDetailsModal.querySelector('#attachments-container');
        container.innerHTML = '';
        if (!attachments || attachments.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-500 py-4">No attachments.</div>`;
            return;
        }
        attachments.forEach((attachment, index) => {
            const div = document.createElement('div');
            div.className = 'attachment-item flex items-center justify-between p-2 bg-gray-100/60 dark:bg-gray-700/50 rounded-md group';
            div.innerHTML = `
                <div class="flex items-center gap-3 min-w-0">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-500 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M8 4a3 3 0 00-3 3v4a3 3 0 106 0V7a1 1 0 112 0v4a5 5 0 11-10 0V7a3 3 0 013-3z" clip-rule="evenodd" />
                    </svg>
                    <span class="truncate text-sm text-gray-800 dark:text-gray-200">${attachment.name}</span>
                </div>
                <div class="attachment-actions opacity-0 group-hover:opacity-100 transition-opacity">
                    <button data-index="${index}" class="preview-attachment-btn p-1 text-gray-500 hover:text-indigo-400"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg></button>
                    <button data-index="${index}" class="delete-attachment-btn p-1 text-gray-500 hover:text-red-400">&times;</button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    function renderSubTasks(subTasks) {
        const container = taskDetailsModal.querySelector('#subtasks-container');
        container.innerHTML = '';
        if (!subTasks || subTasks.length === 0) {
            container.innerHTML = `<div class="text-center text-gray-500 py-4">No sub-todos yet.</div>`;
            return;
        }
        subTasks.forEach((subtask, index) => {
            const div = document.createElement('div');
            div.className = 'subtask-item flex items-center gap-3 bg-gray-100/60 dark:bg-gray-700/50 p-2 rounded-md group';
            div.dataset.index = index;
            div.draggable = true;
            div.innerHTML = `
                        <svg class="w-4 h-4 text-gray-400 cursor-grab flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16m-7 6h7"></path></svg>
                        <input type="checkbox" class="subtask-checkbox h-4 w-4 rounded border-gray-400 dark:border-gray-500 bg-gray-300 dark:bg-gray-700 text-indigo-500 flex-shrink-0 focus:ring-indigo-500" ${subtask.done ? 'checked' : ''}>
                        <span class="subtask-text flex-grow ${subtask.done ? 'line-through text-gray-500' : 'text-gray-800 dark:text-gray-200'}">${subtask.text}</span>
                        <div class="subtask-actions opacity-0 group-hover:opacity-100 transition-opacity">
                            <button class="delete-subtask-btn p-1 text-gray-500 hover:text-red-400">&times;</button>
                        </div>
                    `;
            container.appendChild(div);
        });
    }

    function init() {
        // Assign DOM elements now that the DOM is ready
        appPlannerContainer = document.getElementById('app-planner');
        grid = document.getElementById('eisenhower-grid');
        workspaceManager = document.getElementById('workspace-manager');
        unsortedColumnWrapper = document.getElementById('unsorted-column-wrapper');
        unsortedContainer = document.getElementById('unsorted-container');
        currentDateEl = document.getElementById('current-date');
        todayBtn = document.getElementById('today-btn');
        prevDayBtn = document.getElementById('prev-day-btn');
        nextDayBtn = document.getElementById('next-day-btn');
        calendarBtn = document.getElementById('calendar-btn');
        calendarPopover = document.getElementById('calendar-popover');
        monthYearEl = document.getElementById('month-year');
        calendarGrid = document.getElementById('calendar-grid');
        prevMonthBtn = document.getElementById('prev-month-btn');
        nextMonthBtn = document.getElementById('next-month-btn');
        workspaceModal = document.getElementById('workspace-modal');
        taskDetailsModal = document.getElementById('task-details-modal');
        mediaPreviewModal = document.getElementById('media-preview-modal');
        workspaceInput = workspaceModal.querySelector('#workspace-input');
        fileAttachmentInput = document.getElementById('file-attachment-input');
        imagePreviewElement = document.getElementById('image-preview-element');
        videoPreviewElement = document.getElementById('video-preview-element');
        audioPreviewElement = document.getElementById('audio-preview-element');
        pdfPreviewElement = document.getElementById('pdf-preview-element');

        initDB().then(() => {
            loadData();
            renderAllPlanner();
            bindPlannerEventListeners();
        }).catch(error => {
            console.error("Failed to initialize the planner database:", error);
            // Fallback if DB fails
            loadData();
            renderAllPlanner();
            bindPlannerEventListeners();
        });

        prevDayBtn.addEventListener('click', () => {
            uiState.currentDate.setDate(uiState.currentDate.getDate() - 1);
            saveData();
            renderAllPlanner();
        });

        nextDayBtn.addEventListener('click', () => {
            uiState.currentDate.setDate(uiState.currentDate.getDate() + 1);
            saveData();
            renderAllPlanner();
        });

        calendarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            calendarPopover.classList.toggle('hidden');
        });
    }

    function bindPlannerEventListeners() {
        appPlannerContainer.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;

            // Add Task
            if (button.classList.contains('add-task-btn')) {
                const form = button.nextElementSibling;
                button.classList.add('hidden');
                form.classList.remove('hidden');
                form.querySelector('textarea').focus();
                return;
            }

            // Cancel Inline Task
            if (button.classList.contains('cancel-inline-task-btn')) {
                const form = button.closest('.add-task-form');
                const addTaskBtn = form.previousElementSibling;
                form.classList.add('hidden');
                addTaskBtn.classList.remove('hidden');
                form.querySelector('textarea').value = '';
                return;
            }

            // Save Inline Task
            if (button.classList.contains('save-inline-task-btn')) {
                const form = button.closest('.add-task-form');
                const textarea = form.querySelector('textarea');
                const text = textarea.value.trim();
                if (text) {
                    addTask(form.dataset.quadrantId, text);
                }
                textarea.value = '';
                form.classList.add('hidden');
                form.previousElementSibling.classList.remove('hidden');
                return;
            }
        });

        todayBtn.addEventListener('click', () => {
            uiState.currentDate = new Date();
            saveData();
            renderAllPlanner();
        });

        prevDayBtn.addEventListener('click', () => {
            uiState.currentDate.setDate(uiState.currentDate.getDate() - 1);
            saveData();
            renderAllPlanner();
        });

        nextDayBtn.addEventListener('click', () => {
            uiState.currentDate.setDate(uiState.currentDate.getDate() + 1);
            saveData();
            renderAllPlanner();
        });

        calendarBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            calendarPopover.classList.toggle('hidden');
            if (!calendarPopover.classList.contains('hidden')) {
                calendarDate = new Date(uiState.currentDate);
                renderCalendar();
            }
        });

        document.addEventListener('click', (e) => {
            if (!calendarPopover.classList.contains('hidden') && !calendarPopover.contains(e.target) && !calendarBtn.contains(e.target)) {
                calendarPopover.classList.add('hidden');
            }

            const dropdownContainer = document.getElementById('workspace-dropdown-container');
            const dropdownMenu = document.getElementById('workspace-dropdown-menu');
            if (dropdownMenu && !dropdownMenu.classList.contains('hidden') && !dropdownContainer.contains(e.target)) {
                dropdownMenu.classList.add('hidden');
            }
        });

        prevMonthBtn.addEventListener('click', () => {
            calendarDate.setMonth(calendarDate.getMonth() - 1);
            renderCalendar();
        });

        nextMonthBtn.addEventListener('click', () => {
            calendarDate.setMonth(calendarDate.getMonth() + 1);
            renderCalendar();
        });

        calendarGrid.addEventListener('click', e => {
            const dayCell = e.target.closest('.calendar-day');
            if (dayCell && !dayCell.classList.contains('other-month')) {
                const day = parseInt(dayCell.textContent);
                uiState.currentDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
                saveData();
                renderAllPlanner();
                calendarPopover.classList.add('hidden');
            }
        });

        // Workspace event listeners
        workspaceManager.addEventListener('click', e => {
            const button = e.target.closest('button');
            if (!button) return;

            // Switch Workspace
            if (button.classList.contains('workspace-btn')) {
                const workspaceId = button.dataset.id;
                console.log("Switching to workspace:", workspaceId);
                // eisenhowerPlanner.switchWorkspace(workspaceId);
                document.getElementById('workspace-dropdown-menu').classList.add('hidden');
                return;
            }

            // Edit Workspace
            if (button.classList.contains('edit-workspace-btn')) {
                const workspaceId = button.dataset.id;
                window.openWorkspaceModal(workspaceId); // Assumes openWorkspaceModal is globally available
                return;
            }

            // Delete Workspace
            if (button.classList.contains('delete-workspace-btn')) {
                const workspaceId = button.dataset.id;
                console.log("Deleting workspace:", workspaceId);
                // openConfirmationModal(...)
                return;
            }

            // Add Workspace
            if (button.id === 'add-workspace-btn-dropdown') {
                window.openWorkspaceModal(); // Assumes openWorkspaceModal is globally available
                document.getElementById('workspace-dropdown-menu').classList.add('hidden');
                return;
            }

            // Other buttons...
        });

        // Listeners for modals, which are outside the main app container
        const subtaskForm = document.getElementById('add-subtask-form');
        if (subtaskForm) {
            subtaskForm.addEventListener('submit', e => {
                e.preventDefault();
                const input = document.getElementById('subtask-input');
                const text = input.value.trim();
                if (text && editingTaskLocation) {
                    const { quadrantId, index } = editingTaskLocation;
                    const activeWS = appData.workspaces.find(ws => ws.id === appData.activeWorkspaceId);
                    const dateStr = uiState.currentDate.toISOString().split('T')[0];
                    const task = activeWS.tasks[dateStr][quadrantId][index];
                    if (!task.subTasks) {
                        task.subTasks = [];
                    }
                    task.subTasks.push({ text, done: false });
                    input.value = '';
                    saveData();
                    renderSubTasks(task.subTasks);
                    // Also re-render the main tasks to update subtask counts
                    renderTasks();
                }
            });
        }

        const workspaceSaveBtn = document.getElementById('workspace-save-btn');
        if (workspaceSaveBtn) {
            workspaceSaveBtn.addEventListener('click', () => {
                const workspaceInput = document.getElementById('workspace-input');
                const newName = workspaceInput.value.trim();
                if (!newName) return;

                if (editingTaskLocation && editingTaskLocation.editingWorkspaceId) {
                    // Editing existing workspace
                    const ws = appData.workspaces.find(w => w.id === editingTaskLocation.editingWorkspaceId);
                    if (ws) {
                        ws.name = newName;
                    }
                } else {
                    // Adding new workspace
                    const newWorkspace = {
                        id: `ws-${Date.now()}`,
                        name: newName,
                        tasks: {
                            [getTodayDateString()]: JSON.parse(JSON.stringify(defaultTasks))
                        }
                    };
                    appData.workspaces.push(newWorkspace);
                    appData.activeWorkspaceId = newWorkspace.id;
                }
                saveData();
                renderAllPlanner();
                closeWorkspaceModal();
            });
        }
        
        const workspaceCancelBtn = document.getElementById('workspace-cancel-btn');
        if(workspaceCancelBtn) workspaceCancelBtn.addEventListener('click', closeWorkspaceModal);

        const taskDetailsCloseBtn = document.getElementById('task-details-close-btn');
        if(taskDetailsCloseBtn) taskDetailsCloseBtn.addEventListener('click', closeTaskDetailsModal);

        if (fileAttachmentInput) {
            fileAttachmentInput.addEventListener('change', handleFileAttachment);
        }

        const attachmentsContainer = document.getElementById('attachments-container');
        if (attachmentsContainer) {
            attachmentsContainer.addEventListener('click', e => {
                const deleteButton = e.target.closest('.delete-attachment-btn');
                const previewButton = e.target.closest('.preview-attachment-btn');

                if (deleteButton) {
                    const index = parseInt(deleteButton.dataset.index);
                    handleDeleteAttachment(index);
                }

                if (previewButton) {
                    const index = parseInt(previewButton.dataset.index);
                    handlePreviewAttachment(index);
                }
            });
        }

        const mediaPreviewCloseBtn = document.getElementById('media-preview-close-btn');
        if (mediaPreviewCloseBtn) {
            mediaPreviewCloseBtn.addEventListener('click', closeMediaPreview);
        }
    }

    // Expose public methods
    return {
        init,
        renderAllPlanner,
        addTask
    };
})();

// ==================================================================
// --- SUBSCRIPTION TRACKER LOGIC ---
// ==================================================================
window.subscriptionTrackerAPI = (function subscriptionTracker() {
    let subscriptions = [];
    let editingSubscriptionId = null;
    let currencySymbol = '$';
    let viewMode = 'list'; // 'list' or 'calendar'
    let calendarDate = new Date();

    function formatNumber(num) {
        return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Declare DOM element variables
    let subscriptionModal, subscriptionForm, subscriptionListView, subscriptionCalendarView,
        addSubscriptionBtn, cancelSubscriptionBtn, subscriptionSummary,
        listViewBtn, calendarViewBtn, searchInput,
        calendarControls, calendarMonthYear, calendarGrid,
        calendarPrevMonthBtn, calendarNextMonthBtn, calendarTodayBtn;


    function loadSubscriptions() {
        const storedSubscriptions = JSON.parse(localStorage.getItem('subscriptionTrackerV2'));
        if (storedSubscriptions) {
            subscriptions = storedSubscriptions.map(s => {
                // Basic data migration for older formats
                if (s.nextPaymentDate) {
                    s.next_payment_date = s.nextPaymentDate;
                    delete s.nextPaymentDate;
                }
                return {
                    ...s,
                    next_payment_date: new Date(s.next_payment_date)
                };
            });
        }
        const storedSettings = JSON.parse(localStorage.getItem('subscriptionTrackerSettingsV1'));
        if (storedSettings) {
            currencySymbol = storedSettings.currencySymbol || '$';
            viewMode = storedSettings.viewMode || 'list';
        }
    }

    function saveSubscriptions() {
        localStorage.setItem('subscriptionTrackerV2', JSON.stringify(subscriptions));
        localStorage.setItem('subscriptionTrackerSettingsV1', JSON.stringify({
            currencySymbol,
            viewMode
        }));
    }

    function render(searchTerm = '') {
        applyViewMode();
        const filtered = subscriptions.filter(s => s && s.name && s.name.toLowerCase().includes(searchTerm.toLowerCase()));

        if (viewMode === 'list') {
            renderListView(filtered);
        } else {
            renderCalendarView();
        }
        updateSummary(filtered);
    }

    function renderListView(filteredSubscriptions) {
        subscriptionListView.innerHTML = '';
        if (filteredSubscriptions.length === 0) {
            const emptyMessage = `<div class="col-span-full text-center py-12 text-gray-500 dark:text-gray-400">
                                    <svg class="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1"><path stroke-linecap="round" stroke-linejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3h2m-4 3h2m-4 3h2m-4 3h2m-4 3h2m-4 3h2" /></svg>
                                    <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No subscriptions</h3>
                                    <p class="mt-1 text-sm text-gray-500">Get started by adding a new subscription.</p>
                                  </div>`;
            subscriptionListView.innerHTML = emptyMessage;
        } else {
            filteredSubscriptions.forEach(sub => {
                subscriptionListView.appendChild(createSubscriptionListItem(sub));
            });
        }
    }

    function getNextPaymentDate(startDate, frequency_unit, frequency_count) {
        let d = new Date(startDate);
        // If the start date is in the past, we need to find the next valid payment date from today.
        if (d < new Date()) {
            let today = new Date();
            today.setHours(0, 0, 0, 0); // Normalize today's date
            d = new Date(startDate); // Reset to original start date

            while (d < today) {
                switch (frequency_unit) {
                    case 'days': d.setDate(d.getDate() + frequency_count); break;
                    case 'weeks': d.setDate(d.getDate() + frequency_count * 7); break;
                    case 'months': d.setMonth(d.getMonth() + frequency_count); break;
                    case 'years': d.setFullYear(d.getFullYear() + frequency_count); break;
                    default: return new Date(); // Should not happen
                }
            }
        }
        return d;
    }

    function getPaymentsForMonth(sub, year, month) {
        const payments = [];
        let paymentDate = new Date(sub.next_payment_date);
        const endDate = new Date(year, month + 1, 0);

        // Go back to find the first payment date that could affect the current month
        while (paymentDate > new Date(year, month, 1)) {
             let tempDate = new Date(paymentDate);
             switch (sub.frequency_unit) {
                case 'days': tempDate.setDate(tempDate.getDate() - sub.frequency_count); break;
                case 'weeks': tempDate.setDate(tempDate.getDate() - sub.frequency_count * 7); break;
                case 'months': tempDate.setMonth(tempDate.getMonth() - sub.frequency_count); break;
                case 'years': tempDate.setFullYear(tempDate.getFullYear() - sub.frequency_count); break;
             }
             if (tempDate < paymentDate) {
                 paymentDate = tempDate;
             } else {
                 break; // Avoid infinite loop if logic is flawed
             }
        }

        // Iterate forward through the month
        while (paymentDate <= endDate) {
            if (paymentDate.getFullYear() === year && paymentDate.getMonth() === month) {
                payments.push({ ...sub, payment_date_in_month: new Date(paymentDate) });
            }
            switch (sub.frequency_unit) {
                case 'days': paymentDate.setDate(paymentDate.getDate() + sub.frequency_count); break;
                case 'weeks': paymentDate.setDate(paymentDate.getDate() + sub.frequency_count * 7); break;
                case 'months': paymentDate.setMonth(paymentDate.getMonth() + sub.frequency_count); break;
                case 'years': paymentDate.setFullYear(paymentDate.getFullYear() + sub.frequency_count); break;
            }
        }
        return payments;
    }

    function renderCalendarView() {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        calendarMonthYear.textContent = calendarDate.toLocaleDateString('default', { month: 'short', year: 'numeric' });

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        calendarGrid.innerHTML = '';

        // Add day headers
        const dayHeaders = document.createElement('div');
        dayHeaders.className = 'contents';
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
            dayHeaders.innerHTML += `<div class="text-center font-semibold text-xs text-gray-500 dark:text-gray-400 pb-2">${day}</div>`;
        });
        calendarGrid.appendChild(dayHeaders);

        // Add empty cells for the first day
        for (let i = 0; i < firstDay; i++) {
            calendarGrid.innerHTML += '<div></div>';
        }

        const paymentsByDay = {};
        subscriptions.forEach(sub => {
            if (sub.status !== 'active') return;
            const payments = getPaymentsForMonth(sub, year, month);
            payments.forEach(p => {
                const day = p.payment_date_in_month.getDate();
                if (!paymentsByDay[day]) paymentsByDay[day] = [];
                paymentsByDay[day].push(p);
            });
        });
        
        // Add day cells
        for (let day = 1; day <= daysInMonth; day++) {
            const today = new Date();
            const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            const dayEl = document.createElement('div');
            dayEl.className = 'relative border-t border-gray-200 dark:border-gray-700/50 p-1 min-h-[100px]';
            dayEl.innerHTML = `<div class="text-sm text-center ${isToday ? 'font-bold text-white bg-indigo-600 rounded-full w-6 h-6 flex items-center justify-center mx-auto' : ''}">${day}</div>`;

            if (paymentsByDay[day]) {
                const paymentsList = document.createElement('div');
                paymentsList.className = 'space-y-1 mt-1';
                paymentsByDay[day].slice(0, 3).forEach(p => {
                    const paymentEl = document.createElement('div');
                    paymentEl.className = 'text-xs bg-indigo-100 dark:bg-indigo-600/30 p-1 rounded flex justify-between items-center';
                    paymentEl.innerHTML = `
                        <span class="truncate">${p.name}</span>
                        <span class="font-semibold ml-1">${p.currency || currencySymbol}${formatNumber(p.price)}</span>
                    `;
                    paymentEl.title = `${p.name} - ${p.currency || currencySymbol}${formatNumber(p.price)}`;
                    paymentsList.appendChild(paymentEl);
                });
                if (paymentsByDay[day].length > 3) {
                     paymentsList.innerHTML += `<div class="text-xs text-gray-500">+${paymentsByDay[day].length - 3} more</div>`;
                }
                dayEl.appendChild(paymentsList);
            }
            calendarGrid.appendChild(dayEl);
        }
    }

    function getMonthlyCost(sub) {
        if (sub.status !== 'active') return 0;
        const count = sub.frequency_count || 1;
        switch (sub.frequency_unit) {
            case 'days': return (sub.price / count) * 30.44;
            case 'weeks': return (sub.price / count) * 4.33;
            case 'months': return sub.price / count;
            case 'years': return sub.price / (count * 12);
            default: return 0;
        }
    }

    function updateSummary(filteredSubscriptions) {
        const totalsByCurrency = subscriptions.reduce((acc, sub) => {
            const cost = getMonthlyCost(sub);
            if (cost > 0) { // getMonthlyCost returns 0 for inactive
                const currency = sub.currency || 'USD';
                if (!acc[currency]) {
                    acc[currency] = 0;
                }
                acc[currency] += cost;
            }
            return acc;
        }, {});

        const totalMonthlyHtml = Object.entries(totalsByCurrency)
            .map(([currency, total]) => `${currency} ${formatNumber(total)}`)
            .join('<span class="text-gray-400 dark:text-gray-500 mx-2">|</span>');

        const upcoming = subscriptions
            .filter(s => s.status === 'active' && new Date(s.next_payment_date) >= new Date())
            .sort((a, b) => new Date(a.next_payment_date) - new Date(b.next_payment_date));

        let upcomingBillingHtml = 'No upcoming payments.';
        if (upcoming.length > 0) {
            const next = upcoming[0];
            const daysUntil = Math.ceil((new Date(next.next_payment_date) - new Date()) / (1000 * 60 * 60 * 24));
            upcomingBillingHtml = `
                <span class="font-semibold">${next.name}</span> is next in <span class="font-bold text-indigo-500">${daysUntil}</span> days (${next.currency || currencySymbol}${formatNumber(next.price)})
            `;
        }

        subscriptionSummary.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div class="bg-white dark:bg-gray-800/60 p-4 rounded-lg shadow-sm">
                    <p class="text-sm text-gray-500 dark:text-gray-400">Total Monthly Cost</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">${totalMonthlyHtml || 'No active subscriptions'}</p>
                </div>
                <div class="bg-white dark:bg-gray-800/60 p-4 rounded-lg shadow-sm">
                    <p class="text-sm text-gray-500 dark:text-gray-400">Active Subscriptions</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">${subscriptions.filter(s => s.status === 'active').length}</p>
                </div>
                <div class="bg-white dark:bg-gray-800/60 p-4 rounded-lg shadow-sm">
                    <p class="text-sm text-gray-500 dark:text-gray-400">Upcoming Billing</p>
                    <p class="text-lg font-semibold text-gray-900 dark:text-white truncate">${upcomingBillingHtml}</p>
                </div>
            </div>
        `;
    }

    function createSubscriptionListItem(sub) {
        const item = document.createElement('div');
        item.className = 'subscription-list-item bg-white dark:bg-gray-800/60 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700/80 p-4 flex items-center justify-between';
        const nextPaymentDate = new Date(sub.next_payment_date);
        const daysUntil = Math.ceil((nextPaymentDate - new Date()) / (1000 * 60 * 60 * 24));
        const isOverdue = daysUntil < 0 && sub.status === 'active';

        const frequency = `every ${sub.frequency_count || 1} ${sub.frequency_unit || 'month(s)'}`;

        item.innerHTML = `
                    <div class="flex items-center gap-4 flex-grow min-w-0">
                        <div class="w-10 h-10 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                             <img src="https://logo.clearbit.com/${sub.name.toLowerCase().replace(/\s+/g, '')}.com" alt="${sub.name}" class="w-6 h-6 object-contain" onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');">
                             <span class="hidden text-lg font-bold text-gray-500">${sub.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div class="flex-grow min-w-0">
                            <p class="font-semibold text-gray-900 dark:text-white truncate">${sub.name}</p>
                            <p class="text-sm text-gray-500 dark:text-gray-400 truncate">${sub.payment_method || 'N/A'}</p>
                        </div>
                    </div>
                    <div class="w-1/5 text-center flex-shrink-0">
                        <p class="font-semibold text-gray-900 dark:text-white">${sub.currency || currencySymbol}${formatNumber(sub.price)}</p>
                        <p class="text-sm text-gray-500 dark:text-gray-400 capitalize">${frequency}</p>
                    </div>
                    <div class="w-1/5 text-center flex-shrink-0">
                        <p class="font-semibold ${isOverdue ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}">${sub.status === 'active' ? nextPaymentDate.toLocaleDateString() : 'Cancelled'}</p>
                        ${sub.status === 'active' ? (isOverdue ? `<p class="text-xs text-red-500">(Overdue)</p>` : `<p class="text-xs text-gray-500">(${daysUntil} days)</p>`) : ''}
                    </div>
                    <div class="flex items-center justify-end gap-2 flex-shrink-0">
                        <button data-id="${sub.id}" class="edit-subscription-btn p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus-ring"><svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg></button>
                        <button data-id="${sub.id}" class="delete-subscription-btn p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus-ring"><svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>
                    </div>
                `;
        return item;
    }

    function openSubscriptionModal(id = null) {
        subscriptionForm.reset();
        document.getElementById('cancellation-date-container').classList.add('hidden');
        editingSubscriptionId = id;
        if (id) {
            subscriptionModal.querySelector('#subscription-modal-title').textContent = 'Edit Subscription';
            const sub = subscriptions.find(s => s.id === id);
            document.getElementById('subscription-name').value = sub.name;
            document.getElementById('subscription-price').value = sub.price;
            document.getElementById('subscription-currency').value = sub.currency || 'USD';
            document.getElementById('subscription-frequency-count').value = sub.frequency_count || 1;
            document.getElementById('subscription-frequency-unit').value = sub.frequency_unit || 'months';
            // Use first_payment_date if it exists, otherwise fallback to next_payment_date for older data
            const paymentDate = sub.first_payment_date || sub.next_payment_date;
            document.getElementById('subscription-next-payment').value = new Date(paymentDate).toISOString().split('T')[0];
            document.getElementById('subscription-payment-method').value = sub.payment_method || '';
            document.getElementById('subscription-status').value = sub.status || 'active';
            if (sub.status === 'cancelled') {
                document.getElementById('cancellation-date-container').classList.remove('hidden');
                document.getElementById('subscription-cancellation-date').value = sub.cancellation_date ? new Date(sub.cancellation_date).toISOString().split('T')[0] : '';
            }
        } else {
            subscriptionModal.querySelector('#subscription-modal-title').textContent = 'Add New Subscription';
            document.getElementById('subscription-next-payment').value = new Date().toISOString().split('T')[0];
        }
        subscriptionModal.classList.remove('hidden');
    }

    function closeSubscriptionModal() {
        subscriptionModal.classList.add('hidden');
        editingSubscriptionId = null;
    }

    function applyViewMode() {
        const isList = viewMode === 'list';
        subscriptionListView.classList.toggle('hidden', !isList);
        subscriptionCalendarView.classList.toggle('hidden', isList);
        calendarControls.classList.toggle('hidden', isList);
        document.getElementById('tracker-list-controls').classList.toggle('hidden', !isList);

        listViewBtn.classList.toggle('bg-white', isList);
        listViewBtn.classList.toggle('dark:bg-gray-700', isList);
        calendarViewBtn.classList.toggle('bg-white', !isList);
        calendarViewBtn.classList.toggle('dark:bg-gray-700', !isList);
    }

    function bindSubscriptionEventListeners() {
        addSubscriptionBtn.addEventListener('click', () => openSubscriptionModal());

        const closeBtn = document.getElementById('subscription-modal-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', closeSubscriptionModal);

        const cancelBtn = document.getElementById('subscription-form-cancel-btn');
        if (cancelBtn) cancelBtn.addEventListener('click', closeSubscriptionModal);

        subscriptionForm.addEventListener('submit', e => {
            e.preventDefault();
            
            // The form elements in index.html do not have `name` attributes.
            // We must get the values by their ID.
            const firstPaymentDate = new Date(document.getElementById('subscription-next-payment').value);
            const frequencyUnit = document.getElementById('subscription-frequency-unit').value;
            const frequencyCount = parseInt(document.getElementById('subscription-frequency-count').value, 10);
            const status = document.getElementById('subscription-status').value;

            const subData = {
                name: document.getElementById('subscription-name').value,
                price: parseFloat(document.getElementById('subscription-price').value),
                currency: document.getElementById('subscription-currency').value,
                frequency_count: frequencyCount,
                frequency_unit: frequencyUnit,
                first_payment_date: firstPaymentDate, // Store the original start date
                next_payment_date: getNextPaymentDate(firstPaymentDate, frequencyUnit, frequencyCount), // Calculate the true next payment date
                payment_method: document.getElementById('subscription-payment-method').value,
                status: status,
                cancellation_date: status === 'cancelled' ? new Date(document.getElementById('subscription-cancellation-date').value) : null
            };

            if (editingSubscriptionId) {
                const index = subscriptions.findIndex(s => s.id === editingSubscriptionId);
                subscriptions[index] = { ...subscriptions[index], ...subData };
            } else {
                subscriptions.push({ id: `sub-${Date.now()}`, ...subData });
            }
            saveSubscriptions();
            render();
            closeSubscriptionModal();
        });

        document.getElementById('subscription-status').addEventListener('change', e => {
            document.getElementById('cancellation-date-container').classList.toggle('hidden', e.target.value !== 'cancelled');
        });

        listViewBtn.addEventListener('click', () => {
            viewMode = 'list';
            render();
            saveSubscriptions();
        });

        calendarViewBtn.addEventListener('click', () => {
            viewMode = 'calendar';
            render();
            saveSubscriptions();
        });

        searchInput.addEventListener('input', e => {
            render(e.target.value);
        });

        calendarPrevMonthBtn.addEventListener('click', () => {
            calendarDate.setMonth(calendarDate.getMonth() - 1);
            renderCalendarView();
        });
        calendarNextMonthBtn.addEventListener('click', () => {
            calendarDate.setMonth(calendarDate.getMonth() + 1);
            renderCalendarView();
        });
        calendarTodayBtn.addEventListener('click', () => {
            calendarDate = new Date();
            renderCalendarView();
        });


        function handleSubscriptionActions(e) {
            const target = e.target.closest('button');
            if (!target) return;

            const id = target.dataset.id;
            if (target.classList.contains('edit-subscription-btn')) {
                openSubscriptionModal(id);
            } else if (target.classList.contains('delete-subscription-btn')) {
                openConfirmationModal('Delete this subscription?', () => {
                    subscriptions = subscriptions.filter(s => s.id !== id);
                    saveSubscriptions();
                    render();
                }, { confirmText: 'Delete' });
            }
        }

        subscriptionListView.addEventListener('click', handleSubscriptionActions);
    }

    function init() {
        // Assign DOM elements now that the DOM is ready
        subscriptionModal = document.getElementById('subscription-modal');
        subscriptionForm = document.getElementById('subscription-form');
        subscriptionListView = document.getElementById('subscription-list-view');
        subscriptionCalendarView = document.getElementById('subscription-calendar-view');
        addSubscriptionBtn = document.getElementById('add-subscription-btn');
        subscriptionSummary = document.getElementById('subscription-summary');
        listViewBtn = document.getElementById('tracker-view-list-btn');
        calendarViewBtn = document.getElementById('tracker-view-calendar-btn');
        searchInput = document.getElementById('subscription-search');
        calendarControls = document.getElementById('tracker-calendar-controls');
        calendarMonthYear = document.getElementById('calendar-month-year');
        calendarGrid = document.getElementById('subscription-calendar-view'); // The grid is the view itself
        calendarGrid.classList.add('grid', 'grid-cols-7', 'gap-px'); // Add grid styles
        calendarPrevMonthBtn = document.getElementById('calendar-prev-month-btn');
        calendarNextMonthBtn = document.getElementById('calendar-next-month-btn');
        calendarTodayBtn = document.getElementById('calendar-today-btn');


        loadSubscriptions();
        render();
        bindSubscriptionEventListeners();
    }

    return {
        init
    };
})();

// --- GLOBAL INITIALIZATION ---
function initializeApp() {
    // Initialize both apps
    window.eisenhowerPlannerAPI.init();
    window.subscriptionTrackerAPI.init();

    // Set initial theme
    updateTheme();

    // Set initial view based on localStorage
    switchApp(appState.activeApp);
}

initializeApp();
