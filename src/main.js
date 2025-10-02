import './style.css'

class ChatAccordion {
    constructor() {
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.dropZone = document.getElementById('drop-zone');
        this.fileInput = document.getElementById('file-input');
        this.browseBtn = document.getElementById('browse-btn');
        this.uploadSection = document.getElementById('upload-section');
        this.accordionContainer = document.getElementById('accordion-container');
        this.accordion = document.getElementById('accordion');
        this.fileInfo = document.getElementById('file-info');
        this.errorMessage = document.getElementById('error-message');
    }

    setupEventListeners() {
        // File input change
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

        // Browse button click
        this.browseBtn.addEventListener('click', () => this.fileInput.click());

        // Drop zone events
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('dragover', this.handleDragOver.bind(this));
        this.dropZone.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.dropZone.addEventListener('drop', this.handleDrop.bind(this));
    }

    handleDragOver(e) {
        e.preventDefault();
        this.dropZone.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.dropZone.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        this.dropZone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.handleFileSelect(files[0]);
        }
    }

    handleFileSelect(file) {
        if (!file) return;

        // Validate file type
        if (!file.name.toLowerCase().endsWith('.json')) {
            this.showError('Please select a JSON file.');
            return;
        }

        this.hideError();
        this.readFile(file);
    }

    readFile(file) {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                this.processJsonData(jsonData, file.name);
            } catch (error) {
                this.showError('Invalid JSON file. Please check the file format.');
            }
        };

        reader.onerror = () => {
            this.showError('Error reading file. Please try again.');
        };

        reader.readAsText(file);
    }

    processJsonData(data, fileName) {
        // Extract conversations from the JSON structure
        const conversations = this.extractConversations(data);

        if (conversations.length === 0) {
            this.showError('No valid conversations found in the JSON file.');
            return;
        }

        this.displayFileInfo(fileName, conversations.length);
        this.createAccordion(conversations);
        this.showAccordion();
    }

    extractConversations(data) {
        // Handle VSCode chat.json format specifically
        if (data.requests && Array.isArray(data.requests)) {
            // VSCode format: has a requests array at the top level
            return data.requests.map(request => ({
                requestData: request,
                isVSCodeFormat: true
            }));
        }

        const conversations = [];

        // Handle other possible JSON structures
        if (Array.isArray(data)) {
            // If it's an array of conversations
            conversations.push(...data);
        } else if (data.conversations && Array.isArray(data.conversations)) {
            // If conversations are nested under a conversations key
            conversations.push(...data.conversations);
        } else if (data.messages && Array.isArray(data.messages)) {
            // If it's a single conversation with messages
            conversations.push(data);
        } else {
            // Try to find any conversation-like structure
            for (const key in data) {
                if (Array.isArray(data[key])) {
                    conversations.push(...data[key]);
                }
            }
        }

        return conversations.filter(conv => this.isValidConversation(conv));
    }

    isValidConversation(conversation) {
        // Check if it's VSCode format
        if (conversation.isVSCodeFormat && conversation.requestData) {
            return true;
        }

        // Check if the conversation has the expected structure
        return conversation &&
            (conversation.messages || conversation.turns || conversation.exchanges) &&
            Array.isArray(conversation.messages || conversation.turns || conversation.exchanges);
    }

    getConversationMessages(conversation) {
        return conversation.messages || conversation.turns || conversation.exchanges || [];
    }

    findUserPrompts(conversation) {
        // Handle VSCode format
        if (conversation.isVSCodeFormat && conversation.requestData) {
            return this.extractVSCodeRequest(conversation.requestData);
        }

        // Handle other formats
        const messages = this.getConversationMessages(conversation);
        const userPrompts = [];

        messages.forEach((message, index) => {
            // Look for user messages (various possible structures)
            if (this.isUserMessage(message)) {
                const promptText = this.extractPromptText(message);
                const responseData = this.findCorrespondingResponse(messages, index);

                if (promptText) {
                    userPrompts.push({
                        prompt: promptText,
                        response: responseData,
                        messageIndex: index
                    });
                }
            }
        });

        return userPrompts;
    }

    extractVSCodeRequest(request) {
        // Extract prompt text from VSCode request format
        let promptText = 'No prompt text found';
        if (request.message && request.message.text) {
            promptText = request.message.text;
        } else if (request.message && request.message.parts) {
            // Extract text from parts array
            const textParts = request.message.parts
                .filter(part => part.kind === 'text' && part.text)
                .map(part => part.text);
            promptText = textParts.join('\n') || 'No prompt text found';
        }

        return [{
            prompt: promptText,
            response: request.response || request,
            requestId: request.requestId
        }];
    }

    isUserMessage(message) {
        // Check various possible indicators of user messages
        return (
            message.role === 'user' ||
            message.sender === 'user' ||
            message.type === 'user' ||
            message.from === 'user' ||
            (message.author && message.author.toLowerCase().includes('user'))
        );
    }

    extractPromptText(message) {
        // Extract text from various possible message structures
        return message.content ||
            message.text ||
            message.message ||
            message.prompt ||
            (typeof message === 'string' ? message : '') ||
            'No prompt text found';
    }

    findCorrespondingResponse(messages, userMessageIndex) {
        // Look for the next message(s) that could be a response
        for (let i = userMessageIndex + 1; i < messages.length; i++) {
            const nextMessage = messages[i];
            if (!this.isUserMessage(nextMessage)) {
                return nextMessage;
            }
        }
        return null;
    }

    displayFileInfo(fileName, conversationCount) {
        this.fileInfo.innerHTML = `
      <strong>File:</strong> ${fileName} | 
      <strong>Conversations found:</strong> ${conversationCount}
    `;
    }

    createAccordion(conversations) {
        this.accordion.innerHTML = '';
        let promptCounter = 1;

        conversations.forEach((conversation, convIndex) => {
            const userPrompts = this.findUserPrompts(conversation);

            userPrompts.forEach((promptData, promptIndex) => {
                const accordionItem = this.createAccordionItem(
                    promptData,
                    promptCounter,
                    convIndex,
                    promptIndex
                );
                this.accordion.appendChild(accordionItem);
                promptCounter++;
            });
        });
    }

    createAccordionItem(promptData, promptNumber, convIndex, promptIndex) {
        const item = document.createElement('div');
        item.className = 'accordion-item';

        const header = document.createElement('button');
        header.className = 'accordion-header';
        header.innerHTML = `
      <span class="accordion-title">${promptNumber}. ${this.truncateText(promptData.prompt, 100)}</span>
      <svg class="accordion-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

        const content = document.createElement('div');
        content.className = 'accordion-content';

        const body = document.createElement('div');
        body.className = 'accordion-body';

        const textarea = document.createElement('textarea');
        textarea.className = 'response-textarea';
        textarea.readOnly = true;
        textarea.value = JSON.stringify(promptData.response, null, 2);

        body.appendChild(textarea);
        content.appendChild(body);
        item.appendChild(header);
        item.appendChild(content);

        // Add click event listener
        header.addEventListener('click', () => this.toggleAccordionItem(header, content));

        return item;
    }

    toggleAccordionItem(header, content) {
        const isOpen = content.classList.contains('open');

        // Close all other items
        document.querySelectorAll('.accordion-content.open').forEach(item => {
            item.classList.remove('open');
        });
        document.querySelectorAll('.accordion-header.active').forEach(btn => {
            btn.classList.remove('active');
            btn.querySelector('.accordion-icon').classList.remove('rotated');
        });

        // Toggle current item
        if (!isOpen) {
            content.classList.add('open');
            header.classList.add('active');
            header.querySelector('.accordion-icon').classList.add('rotated');
        }
    }

    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    showAccordion() {
        this.uploadSection.style.display = 'none';
        this.accordionContainer.style.display = 'block';
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorMessage.style.display = 'block';
    }

    hideError() {
        this.errorMessage.style.display = 'none';
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new ChatAccordion();
});