class CustomHeader extends HTMLElement {
    connectedCallback() {
        this.innerHTML = `
            <header class="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
                <div class="container mx-auto px-4 h-20 flex justify-between items-center">
                    <a href="index.html" class="flex items-center gap-2 text-2xl font-bold text-primary">
                        <i data-feather="briefcase"></i>
                        <span>DreamJourney</span>
                    </a>
                    
                    <nav class="hidden lg:flex items-center gap-8">
                        <a href="index.html" class="text-gray-600 hover:text-primary font-medium transition">Home</a>
                        <a href="packages.html" class="text-gray-600 hover:text-primary font-medium transition">Packages</a>
                        <a href="planner.html" class="text-gray-600 hover:text-primary font-medium transition">Planner</a>
                        <a href="loan.html" class="text-gray-600 hover:text-primary font-medium transition">Loan</a>
                        <a href="community.html" class="text-gray-600 hover:text-primary font-medium transition">Community</a>
                    </nav>

                    <div class="hidden lg:flex items-center gap-4">
                        <a href="#" class="text-gray-600 hover:text-primary font-medium">Login</a>
                        <a href="#" class="bg-primary hover:bg-primary-dark text-white px-6 py-2 rounded-full font-semibold transition">Register</a>
                    </div>

                    <button class="lg:hidden text-gray-600">
                        <i data-feather="menu"></i>
                    </button>
                </div>
            </header>
        `;
        
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }
}

customElements.define('custom-header', CustomHeader);
