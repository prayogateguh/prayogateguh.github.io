export default class MindMap {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.nodesContainer = document.getElementById("nodesContainer");

    this.nodes = [];
    this.connections = [];
    this.selectedNode = null;
    this.connectMode = false;
    this.connectStart = null;
    this.draggedNode = null;
    this.dragOffset = { x: 0, y: 0 };
    this.idCounter = 0;

    // Pan state
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };

    this.pages = [];
    this.activePageId = null;

    this.initializeCanvas();
    this.setupEventListeners();
    this.loadState();
  }

  initializeCanvas() {
    this.canvas.width = this.nodesContainer.clientWidth;
    this.canvas.height = this.nodesContainer.clientHeight;
    window.addEventListener("resize", () => this.resizeCanvas());
  }

  resizeCanvas() {
    this.canvas.width = this.nodesContainer.clientWidth;
    this.canvas.height = this.nodesContainer.clientHeight;
    this.redraw();
  }

  setupEventListeners() {
    // Button events
    document
      .getElementById("addNodeBtn")
      .addEventListener("click", () => this.addNode());
    // document
    //   .getElementById("downloadBtn")
    //   .addEventListener("click", () => this.downloadImage());

    document
      .getElementById("addPageBtn")
      .addEventListener("click", () => this.openPageModal());

    const createFirstPageBtn = document.getElementById("createFirstPageBtn");
    if (createFirstPageBtn) {
      createFirstPageBtn.addEventListener("click", () => this.openPageModal());
    }

    // Page Modal events
    const pageModal = document.getElementById("pageModal");
    document
      .getElementById("cancelPageBtn")
      .addEventListener("click", () => this.closePageModal());
    document
      .getElementById("savePageBtn")
      .addEventListener("click", () => this.savePage());
    pageModal.addEventListener("click", (e) => {
      if (e.target === pageModal) this.closePageModal();
    });
    document
      .getElementById("pageNameInput")
      .addEventListener("keydown", (e) => {
        if (e.key === "Enter") this.savePage();
        if (e.key === "Escape") this.closePageModal();
      });

    // Canvas/Container events - use document for drag tracking
    document.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    document.addEventListener("mouseup", (e) => this.handleMouseUp(e));
    document.addEventListener("keydown", (e) => this.handleKeyDown(e));
    this.canvas.addEventListener("click", () => this.deselectNode());
    this.canvas.addEventListener("mousedown", (e) => {
      this.isPanning = true;
      this.panStart = { x: e.clientX, y: e.clientY };
      this.canvas.style.cursor = "grabbing";
    });

    // Modal events
    // Note Modal events
    const noteModal = document.getElementById("noteModal");
    const closeNoteBtn = noteModal.querySelector(".close-note");
    closeNoteBtn.addEventListener("click", () => this.closeNoteModal());
    document
      .getElementById("saveNoteBtn")
      .addEventListener("click", () => this.saveNote());
    noteModal.addEventListener("click", (e) => {
      if (e.target === noteModal) this.closeNoteModal();
    });

    // Action Bar events
    document.getElementById("actionAddChild").addEventListener("click", () => {
      if (this.selectedNode) this.createChildNode(this.selectedNode);
    });
    document.getElementById("actionEditTitle").addEventListener("click", () => {
      if (this.selectedNode) this.startInlineEdit(this.selectedNode);
    });
    document.getElementById("actionEditNote").addEventListener("click", () => {
      if (this.selectedNode) this.openNoteEditor(this.selectedNode);
    });
    document
      .getElementById("actionToggleDone")
      .addEventListener("click", () => {
        if (this.selectedNode) this.toggleDone(this.selectedNode);
      });
    document.getElementById("actionCollapse").addEventListener("click", () => {
      if (this.selectedNode) this.toggleCollapse(this.selectedNode);
    });
    document.getElementById("actionExpand").addEventListener("click", () => {
      if (this.selectedNode) this.toggleExpand(this.selectedNode);
    });
    document.getElementById("actionDelete").addEventListener("click", () => {
      if (this.selectedNode) this.deleteNode(this.selectedNode);
    });

    // Node container events
    this.nodesContainer.addEventListener("mousedown", (e) =>
      this.handleNodeMouseDown(e)
    );
  }

  loadState() {
    const savedData = localStorage.getItem("mindmap_data");
    if (savedData) {
      this.pages = JSON.parse(savedData);
      // Restore idCounter to avoid collisions
      let maxId = 0;
      this.pages.forEach((page) => {
        if (page.nodes) {
          page.nodes.forEach((node) => {
            if (node.id > maxId) maxId = node.id;
          });
        }
      });
      this.idCounter = maxId;
    } else {
      this.pages = [];
    }

    if (this.pages.length === 0) {
      this.showEmptyState();
      this.renderPagesList();
      return;
    }

    // Switch to the last active page or the first one
    const lastActiveId = localStorage.getItem("mindmap_active_page");
    const pageToLoad =
      this.pages.find((p) => p.id === parseInt(lastActiveId)) || this.pages[0];

    if (pageToLoad) {
      this.switchPage(pageToLoad.id);
    } else {
      this.showEmptyState();
    }
  }

  showEmptyState() {
    this.activePageId = null;
    document.getElementById("emptyState").classList.remove("hidden");
    this.canvas.style.display = "none";
    this.nodesContainer.innerHTML = "";
    document.getElementById("actionBar").classList.add("hidden");
    // Disable toolbar buttons
    document.getElementById("addNodeBtn").disabled = true;
    document
      .getElementById("addNodeBtn")
      .classList.add("opacity-50", "cursor-not-allowed");
  }

  hideEmptyState() {
    document.getElementById("emptyState").classList.add("hidden");
    this.canvas.style.display = "block";
    // Enable toolbar buttons
    document.getElementById("addNodeBtn").disabled = false;
    document
      .getElementById("addNodeBtn")
      .classList.remove("opacity-50", "cursor-not-allowed");
  }

  saveState() {
    // Update current page data before saving
    if (this.activePageId) {
      const currentPage = this.pages.find((p) => p.id === this.activePageId);
      if (currentPage) {
        // Save nodes (exclude DOM elements)
        currentPage.nodes = this.nodes.map((n) => ({
          id: n.id,
          text: n.text,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          collapsed: n.collapsed,
          done: n.done,
          note: n.note,
        }));

        // Save connections (store IDs)
        currentPage.connections = this.connections.map((c) => ({
          from: c.from.id,
          to: c.to.id,
        }));
      }
    }

    localStorage.setItem("mindmap_data", JSON.stringify(this.pages));
    localStorage.setItem("mindmap_active_page", this.activePageId);
  }

  switchPage(pageId) {
    // Save current state first if we are switching from a valid page
    if (this.activePageId) {
      this.saveState();
    }

    const page = this.pages.find((p) => p.id === pageId);
    if (!page) return;

    this.activePageId = pageId;

    // Clear current DOM
    this.nodesContainer.innerHTML = "";
    this.selectedNode = null;
    document.getElementById("actionBar").classList.add("hidden");

    // Load nodes
    this.nodes = page.nodes.map((n) => ({
      ...n,
      element: null, // Reset DOM element
    }));

    // Re-create DOM elements
    this.nodes.forEach((node) => this.createNodeElement(node));

    // Re-create connections
    this.connections = page.connections
      .map((c) => {
        const fromNode = this.nodes.find((n) => n.id === c.from);
        const toNode = this.nodes.find((n) => n.id === c.to);
        return { from: fromNode, to: toNode };
      })
      .filter((c) => c.from && c.to); // Filter out broken connections

    // Update UI
    this.renderPagesList();
    this.layoutNodesNew();

    // Update header title if exists (optional, but good for UX)
    // document.title = page.name + " - Mind Map";
  }

  renderPagesList() {
    const pagesList = document.getElementById("pagesList");
    pagesList.innerHTML = "";

    this.pages.forEach((page) => {
      const div = document.createElement("div");
      const isActive = page.id === this.activePageId;

      div.className = `flex items-center justify-between p-2 rounded-lg group cursor-pointer ${
        isActive
          ? "bg-blue-50 dark:bg-blue-900/20"
          : "bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-700"
      }`;

      div.innerHTML = `
        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span class="${
            isActive ? "text-blue-600 dark:text-blue-400" : "text-gray-400"
          }">${isActive ? "●" : "○"}</span>
          <span class="page-name text-sm font-medium truncate ${
            isActive
              ? "text-blue-900 dark:text-blue-100"
              : "text-gray-900 dark:text-gray-100"
          }">${page.name}</span>
        </div>
        <button class="delete-page-btn opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-all" title="Delete Page">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;

      const nameSpan = div.querySelector(".page-name");
      const deleteBtn = div.querySelector(".delete-page-btn");

      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete "${page.name}"?`)) {
          this.deletePage(page.id);
        }
      });

      div.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        this.startPageInlineEdit(page, nameSpan);
      });

      div.addEventListener("click", () => {
        if (this.activePageId !== page.id) {
          this.switchPage(page.id);
        }
      });

      pagesList.appendChild(div);
    });
  }

  startPageInlineEdit(page, element) {
    const currentName = page.name;
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentName;
    input.className =
      "w-full bg-white text-gray-900 rounded px-1 text-sm border border-blue-500 focus:outline-none";

    // Replace span with input
    element.replaceWith(input);
    input.focus();
    input.select();

    let isCancelled = false;

    const save = () => {
      if (isCancelled) return;

      const newName = input.value.trim();
      if (newName && newName !== currentName) {
        page.name = newName;
        this.saveState();
        this.renderPagesList();
      } else {
        this.renderPagesList();
      }
    };

    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
      }
      if (e.key === "Escape") {
        isCancelled = true;
        this.renderPagesList();
      }
      e.stopPropagation();
    });

    input.addEventListener("click", (e) => e.stopPropagation());
  }

  openPageModal() {
    const modal = document.getElementById("pageModal");
    const input = document.getElementById("pageNameInput");
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    input.value = "";
    input.focus();
  }

  closePageModal() {
    const modal = document.getElementById("pageModal");
    modal.classList.add("hidden");
    modal.classList.remove("flex");
  }

  savePage() {
    const input = document.getElementById("pageNameInput");
    const pageName = input.value.trim();

    if (!pageName) {
      alert("Please enter a page name");
      return;
    }

    this.addPage(pageName);
    this.closePageModal();
  }

  addPage(pageName) {
    const pageId = Date.now();

    // Create root node for new page
    const rootNode = {
      id: ++this.idCounter,
      text: pageName,
      x: 50,
      y: this.canvas.height / 2,
      width: 120,
      height: 50,
      collapsed: false,
      done: false,
      note: "",
    };

    const newPage = {
      id: pageId,
      name: pageName,
      nodes: [rootNode],
      connections: [],
    };

    this.pages.push(newPage);
    this.hideEmptyState();
    this.switchPage(pageId);
    this.saveState();
  }

  createNode(text, x, y) {
    const node = {
      id: ++this.idCounter,
      text: text,
      x: x,
      y: y,
      width: 120,
      height: 50,
      element: null,
      collapsed: false,
      done: false,
      note: "",
    };

    this.nodes.push(node);
    this.createNodeElement(node);
    this.redraw();
    this.saveState();
    return node;
  }

  updateNodePosition(node) {
    if (node.element) {
      node.element.style.left = node.x + this.panX + "px";
      node.element.style.top = node.y + this.panY + "px";
    }
  }

  updateAllNodePositions() {
    this.nodes.forEach((node) => this.updateNodePosition(node));
  }

  createNodeElement(node) {
    const div = document.createElement("div");
    div.className =
      "node absolute px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white rounded-lg font-semibold text-sm whitespace-nowrap cursor-pointer transition-shadow hover:shadow-lg hover:bg-gray-800 dark:hover:bg-gray-600 select-none pointer-events-auto";
    div.textContent = node.text;
    div.dataset.nodeId = node.id;

    if (node.done) {
      div.classList.add("line-through", "opacity-75");
    }

    div.addEventListener("click", (e) => {
      e.stopPropagation();
      this.selectNode(node);
    });

    div.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.startInlineEdit(node);
    });

    div.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      this.startDrag(node, e);
    });

    this.nodesContainer.appendChild(div);
    node.element = div;
    this.updateNodePosition(node);

    // Get actual dimensions after rendering
    setTimeout(() => {
      node.width = div.offsetWidth;
      node.height = div.offsetHeight;
      this.redraw();
    }, 0);
  }

  getParents(node) {
    return this.connections
      .filter((conn) => conn.to.id === node.id)
      .map((conn) => conn.from);
  }

  getChildren(node) {
    return this.connections
      .filter((conn) => conn.from.id === node.id)
      .map((conn) => conn.to);
  }

  selectNode(node) {
    if (this.connectMode) {
      if (!this.connectStart) {
        this.connectStart = node;
        node.element.classList.add("ring-2", "ring-green-500");
      } else if (this.connectStart.id !== node.id) {
        this.connect(this.connectStart, node);
        this.connectStart.element.classList.remove("ring-2", "ring-green-500");
        this.connectStart = null;
        this.toggleConnectMode();
      }
    } else {
      if (this.selectedNode) {
        this.selectedNode.element.classList.remove(
          "ring-2",
          "ring-blue-400",
          "bg-blue-600"
        );
        this.selectedNode.element.classList.add(
          "bg-gray-900",
          "dark:bg-gray-700",
          "hover:bg-gray-800",
          "dark:hover:bg-gray-600"
        );
      }
      this.selectedNode = node;
      node.element.classList.remove(
        "bg-gray-900",
        "dark:bg-gray-700",
        "hover:bg-gray-800",
        "dark:hover:bg-gray-600"
      );
      node.element.classList.add("ring-2", "ring-blue-400", "bg-blue-600");

      // Show action bar
      const actionBar = document.getElementById("actionBar");
      actionBar.classList.remove("hidden");

      // Hide delete button if root (no parents)
      const deleteBtn = document.getElementById("actionDelete");
      if (this.getParents(node).length === 0) {
        deleteBtn.classList.add("hidden");
      } else {
        deleteBtn.classList.remove("hidden");
      }
    }
  }

  deselectNode() {
    if (this.selectedNode && !this.connectMode) {
      this.selectedNode.element.classList.remove(
        "ring-2",
        "ring-blue-400",
        "bg-blue-600"
      );
      this.selectedNode.element.classList.add(
        "bg-gray-900",
        "dark:bg-gray-700",
        "hover:bg-gray-800",
        "dark:hover:bg-gray-600"
      );
      this.selectedNode = null;

      // Hide action bar
      document.getElementById("actionBar").classList.add("hidden");
    }
  }

  startDrag(node, e) {
    // Dragging is disabled - nodes maintain auto-layout
    // Do nothing
  }

  handleMouseMove(e) {
    if (this.isPanning) {
      const dx = e.clientX - this.panStart.x;
      const dy = e.clientY - this.panStart.y;

      this.panX += dx;
      this.panY += dy;

      this.panStart = { x: e.clientX, y: e.clientY };

      this.updateAllNodePositions();
      this.redraw();
      return;
    }
    // Dragging is disabled - nodes maintain auto-layout
    // Just prevent default dragging behavior
  }

  handleMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.canvas.style.cursor = "default";
    }
    if (this.draggedNode) {
      this.draggedNode.element.style.cursor = "move";
    }
    this.draggedNode = null;
  }

  handleNodeMouseDown(e) {
    let target = e.target;
    // Find the node element (could be the target or a parent)
    while (target && !target.classList.contains("node")) {
      target = target.parentElement;
      if (target === this.nodesContainer || !target) break;
    }

    if (target && target.classList.contains("node")) {
      const nodeId = parseInt(target.dataset.nodeId);
      const node = this.nodes.find((n) => n.id === nodeId);
      if (node) {
        this.startDrag(node, e);
      }
    }
  }

  connect(nodeA, nodeB) {
    // Check if connection already exists
    const exists = this.connections.some(
      (conn) =>
        (conn.from.id === nodeA.id && conn.to.id === nodeB.id) ||
        (conn.from.id === nodeB.id && conn.to.id === nodeA.id)
    );

    if (!exists) {
      this.connections.push({ from: nodeA, to: nodeB });
      this.layoutNodesNew();
      this.saveState();
    }
  }

  toggleConnectMode() {
    this.connectMode = !this.connectMode;
    const btn = document.getElementById("connectNodeBtn");
    if (this.connectMode) {
      btn.classList.add("bg-emerald-700");
      btn.classList.remove("bg-green-600", "hover:bg-green-700");
    } else {
      btn.classList.remove("bg-emerald-700");
      btn.classList.add("bg-green-600", "hover:bg-green-700");
    }

    if (!this.connectMode && this.connectStart) {
      this.connectStart.element.classList.remove("ring-2", "ring-green-500");
      this.connectStart = null;
    }
  }

  addNode() {
    // Create a new root-level node if no connections exist with it
    this.createNode("New Node", 50, this.canvas.height / 2);
    this.layoutNodesNew();
  }

  handleKeyDown(e) {
    // Tab key to create child node from selected node
    if (e.key === "Tab" && this.selectedNode && !this.connectMode) {
      e.preventDefault();
      this.createChildNode(this.selectedNode);
    }

    // Delete or Backspace to remove selected node
    if ((e.key === "Delete" || e.key === "Backspace") && this.selectedNode) {
      // Don't delete if editing text (though editing is in a modal, so this event might not fire there, but good to be safe if we change to inline edit later)
      // Since we use a modal, the keydown on document might catch it if modal is closed.
      // If modal is open, we should probably not delete.
      const modal = document.getElementById("editModal");
      if (modal.classList.contains("hidden")) {
        this.deleteNode(this.selectedNode);
      }
    }
  }

  deleteNode(node) {
    // Check if root
    if (this.getParents(node).length === 0) {
      alert("Cannot delete root node");
      return;
    }

    // Get all descendants
    const nodesToDelete = new Set();
    const collectDescendants = (n) => {
      nodesToDelete.add(n.id);
      const children = this.getChildren(n);
      children.forEach((child) => collectDescendants(child));
    };
    collectDescendants(node);

    // Remove nodes
    this.nodes = this.nodes.filter((n) => !nodesToDelete.has(n.id));

    // Remove connections
    this.connections = this.connections.filter(
      (conn) =>
        !nodesToDelete.has(conn.from.id) && !nodesToDelete.has(conn.to.id)
    );

    // Remove DOM elements
    nodesToDelete.forEach((id) => {
      const el = document.querySelector(`.node[data-node-id="${id}"]`);
      if (el) el.remove();
    });

    // Clear selection if it was one of the deleted nodes
    if (this.selectedNode && nodesToDelete.has(this.selectedNode.id)) {
      this.selectedNode = null;
      document.getElementById("actionBar").classList.add("hidden");
    }

    // Re-layout and redraw
    this.layoutNodesNew();
    this.saveState();
  }

  createChildNode(parentNode) {
    // Create the child node with a placeholder position
    const childNode = this.createNode("New Node", 0, 0);

    // Auto-connect parent to child
    this.connect(parentNode, childNode);

    // Apply layout to organize all nodes neatly
    this.layoutNodesNew();

    // Select the new child node
    this.selectNode(childNode);
  }

  layoutNodes() {
    // Find root nodes (nodes that have no incoming connections)
    const getParents = (node) => {
      return this.connections
        .filter((conn) => conn.to.id === node.id)
        .map((conn) => conn.from);
    };

    const getRootNodes = () => {
      return this.nodes.filter((node) => getParents(node).length === 0);
    };

    const getChildren = (node) => {
      return this.connections
        .filter((conn) => conn.from.id === node.id)
        .map((conn) => conn.to);
    };

    // Layout configuration
    const horizontalSpacing = 220;
    const verticalSpacing = 100;

    // Position each node based on tree depth
    const positionedNodes = new Set();
    const processed = new Set();

    const layoutNode = (node, x, y, depth) => {
      if (processed.has(node.id)) return;
      processed.add(node.id);

      node.x = x;
      node.y = y;
      if (node.element) {
        node.element.style.left = node.x + "px";
        node.element.style.top = node.y + "px";
      }
      positionedNodes.add(node.id);

      const children = getChildren(node);
      if (children.length > 0) {
        const totalHeight = children.length * verticalSpacing;
        const startY = y - totalHeight / 2 + verticalSpacing / 2;

        children.forEach((child, index) => {
          const childY = startY + index * verticalSpacing;
          const childX = x + horizontalSpacing;
          layoutNode(child, childX, childY, depth + 1);
        });
      }
    };

    // Start layout from root nodes
    const roots = getRootNodes();
    const canvasHeight = this.canvas.height;
    const totalRootSpacing =
      roots.length > 1 ? (canvasHeight - 100) / (roots.length - 1) : 100;

    roots.forEach((root, index) => {
      const rootY = 100 + index * totalRootSpacing;
      layoutNode(root, 50, rootY, 0);
    });

    this.redraw();
  }

  // Better hierarchical tree layout
  layoutNodesNew() {
    const getParents = (node) => {
      return this.connections
        .filter((conn) => conn.to.id === node.id)
        .map((conn) => conn.from);
    };

    const getRootNodes = () => {
      return this.nodes.filter((node) => getParents(node).length === 0);
    };

    const getChildren = (node) => {
      return this.connections
        .filter((conn) => conn.from.id === node.id)
        .map((conn) => conn.to);
    };

    // Layout configuration
    const horizontalSpacing = 280;
    const verticalSpacing = 100;
    const padding = 80;

    // Calculate subtree height for better layout
    const getSubtreeHeight = (node, memo = {}) => {
      if (memo[node.id] !== undefined) return memo[node.id];

      // If collapsed, treat as leaf
      if (node.collapsed) {
        memo[node.id] = 1;
        return 1;
      }

      const children = getChildren(node);
      if (children.length === 0) {
        memo[node.id] = 1;
      } else {
        const sum = children.reduce((total, child) => {
          return total + getSubtreeHeight(child, memo);
        }, 0);
        memo[node.id] = sum;
      }
      return memo[node.id];
    };

    const memo = {};
    const getSubtreeHeightMemo = (node) => getSubtreeHeight(node, memo);

    // Calculate depth using BFS
    const depthMap = {};
    const rootNodes = getRootNodes();

    rootNodes.forEach((root) => {
      depthMap[root.id] = 0;
    });

    let queue = [...rootNodes];
    while (queue.length > 0) {
      const nextQueue = [];
      queue.forEach((node) => {
        const children = getChildren(node);
        children.forEach((child) => {
          depthMap[child.id] = depthMap[node.id] + 1;
          nextQueue.push(child);
        });
      });
      queue = nextQueue;
    }

    // Position calculation function
    const positionMap = {};
    const canvasHeight = this.canvas.height;

    // Calculate total height needed for all roots
    const totalRootsHeight = rootNodes.reduce(
      (sum, root) => sum + getSubtreeHeightMemo(root) * verticalSpacing,
      0
    );

    let currentY = Math.max(padding, (canvasHeight - totalRootsHeight) / 2);

    // Position each root and its descendants
    const positionNode = (node, x, centerY) => {
      positionMap[node.id] = { x, y: centerY };

      // If collapsed, don't position children
      if (node.collapsed) return;

      const children = getChildren(node);
      if (children.length > 0) {
        // Calculate space needed for children
        const totalChildHeight = children.reduce(
          (sum, child) => sum + getSubtreeHeightMemo(child) * verticalSpacing,
          0
        );

        // Position children around parent
        let childY = centerY - totalChildHeight / 2;

        children.forEach((child) => {
          const childSubtreeHeight =
            getSubtreeHeightMemo(child) * verticalSpacing;
          const childCenterY = childY + childSubtreeHeight / 2;
          positionNode(child, x + horizontalSpacing, childCenterY);
          childY += childSubtreeHeight;
        });
      }
    };

    // Position all root nodes
    rootNodes.forEach((root) => {
      const subtreeHeight = getSubtreeHeightMemo(root) * verticalSpacing;
      const rootCenterY = currentY + subtreeHeight / 2;
      positionNode(root, padding, rootCenterY);
      currentY += subtreeHeight;
    });

    // Apply positions to DOM and handle visibility
    this.nodes.forEach((node) => {
      if (positionMap[node.id]) {
        const pos = positionMap[node.id];
        node.x = Math.max(0, pos.x);
        node.y = Math.max(0, pos.y);
        this.updateNodePosition(node);
        if (node.element) {
          node.element.style.display = "block";
        }
      } else {
        // Hide nodes that weren't positioned (collapsed children)
        if (node.element) {
          node.element.style.display = "none";
        }
      }
    });

    this.redraw();
  }

  toggleDone(node) {
    node.done = !node.done;
    if (node.element) {
      if (node.done) {
        node.element.classList.add("line-through", "opacity-75");
      } else {
        node.element.classList.remove("line-through", "opacity-75");
      }
    }
    this.saveState();
  }

  toggleCollapse(node) {
    node.collapsed = true;
    this.layoutNodesNew();
    this.saveState();
  }

  toggleExpand(node) {
    node.collapsed = false;
    this.layoutNodesNew();
    this.saveState();
  }

  openNoteEditor(node) {
    const modal = document.getElementById("noteModal");
    const title = document.getElementById("noteModalTitle");
    const editor = document.getElementById("noteEditor");

    title.textContent = node.text;
    editor.innerHTML = node.note || "";

    modal.classList.remove("hidden");
    this.editingNode = node;
  }

  saveNote() {
    const editor = document.getElementById("noteEditor");
    if (this.editingNode) {
      this.editingNode.note = editor.innerHTML;
      this.saveState();
    }
    this.closeNoteModal();
  }

  closeNoteModal() {
    document.getElementById("noteModal").classList.add("hidden");
    this.editingNode = null;
  }

  startInlineEdit(node) {
    if (!node || !node.element) return;

    const div = node.element;
    const currentText = node.text;

    // Lock dimensions to prevent collapse
    const currentWidth = div.offsetWidth;
    const currentHeight = div.offsetHeight;
    div.style.width = currentWidth + "px";
    div.style.height = currentHeight + "px";

    // Create input element
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentText;
    // Match the node's styling
    input.className =
      "absolute inset-0 w-full h-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg px-4 py-2 font-semibold text-sm border-2 border-blue-500 focus:outline-none text-center no-underline";

    // Clear text content and append input
    div.textContent = "";
    div.appendChild(input);

    // Focus and select all
    input.focus();
    input.select();

    let isCancelled = false;

    const save = () => {
      if (isCancelled) return;

      const newText = input.value.trim();
      if (newText) {
        node.text = newText;
      }

      // Restore text content
      div.textContent = node.text;

      // Remove fixed dimensions so it can resize naturally
      div.style.width = "";
      div.style.height = "";

      // Recalculate dimensions
      setTimeout(() => {
        node.width = div.offsetWidth;
        node.height = div.offsetHeight;
        this.redraw();
        this.saveState();
      }, 0);

      this.editingNode = null;
    };

    // Event listeners
    input.addEventListener("blur", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        input.blur();
      }
      if (e.key === "Escape") {
        isCancelled = true;
        div.textContent = currentText;
        div.style.width = "";
        div.style.height = "";
        this.editingNode = null;
      }
      e.stopPropagation();
    });

    this.editingNode = node;
  }

  clearAll() {
    if (
      confirm(
        "Are you sure you want to clear all nodes? This cannot be undone."
      )
    ) {
      this.nodes = [];
      this.connections = [];
      this.nodesContainer.innerHTML = "";
      this.selectedNode = null;
      this.redraw();
      this.saveState();
    }
  }

  redraw() {
    // Clear canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.panX, this.panY);

    // Draw connections
    this.connections.forEach((conn) => {
      // Only draw if both nodes are visible (not collapsed)
      if (
        conn.from.element.style.display !== "none" &&
        conn.to.element.style.display !== "none"
      ) {
        this.drawConnection(conn.from, conn.to);
      }
    });

    this.ctx.restore();
  }

  drawConnection(nodeA, nodeB) {
    const ax = nodeA.x + nodeA.width / 2;
    const ay = nodeA.y + nodeA.height / 2;
    const bx = nodeB.x + nodeB.width / 2;
    const by = nodeB.y + nodeB.height / 2;

    const isDark = document.documentElement.classList.contains("dark");
    const color = isDark ? "#4b5563" : "#9ca3af"; // gray-600 : gray-400

    // Draw curved line using cubic bezier for smoother S-shape
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(ax, ay);

    // Control points for the curve - creates a smooth S-shape
    // cp1 is halfway horizontally, same Y as start
    // cp2 is halfway horizontally, same Y as end
    const midX = (ax + bx) / 2;
    this.ctx.bezierCurveTo(midX, ay, midX, by, bx, by);
    this.ctx.stroke();

    // Draw small circles at both ends
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(ax, ay, 3, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(bx, by, 3, 0, Math.PI * 2);
    this.ctx.fill();
  }

  downloadImage() {
    const link = document.createElement("a");
    link.href = this.canvas.toDataURL("image/png");
    link.download = "mindmap.png";
    link.click();
  }

  deletePage(pageId) {
    const pageIndex = this.pages.findIndex((p) => p.id === pageId);
    if (pageIndex === -1) return;

    this.pages.splice(pageIndex, 1);

    if (this.pages.length === 0) {
      this.showEmptyState();
      this.renderPagesList();
      this.saveState();
      return;
    }

    if (this.activePageId === pageId) {
      // Switch to the previous page, or the first one
      const newActivePage = this.pages[pageIndex - 1] || this.pages[0];
      this.switchPage(newActivePage.id);
    } else {
      this.renderPagesList();
      this.saveState();
    }
  }
}

// Initialize app when DOM is loaded
// document.addEventListener("DOMContentLoaded", () => {
//   new MindMap();
// });
