// Main application script
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    const tooltipElements = document.querySelectorAll('[data-tooltip]');
    tooltipElements.forEach(el => {
        const tooltipText = el.getAttribute('data-tooltip');
        el.addEventListener('mouseenter', () => {
            const tooltip = document.createElement('div');
            tooltip.className = 'absolute z-50 bg-gray-900 text-white text-xs rounded py-1 px-2';
            tooltip.textContent = tooltipText;
            document.body.appendChild(tooltip);
            
            const rect = el.getBoundingClientRect();
            tooltip.style.top = `${rect.top - 30}px`;
            tooltip.style.left = `${rect.left + rect.width/2 - tooltip.offsetWidth/2}px`;
            
            el.tooltip = tooltip;
        });
        
        el.addEventListener('mouseleave', () => {
            if (el.tooltip) {
                el.tooltip.remove();
            }
        });
    });
    
    // Range slider value display
    const rangeSliders = document.querySelectorAll('input[type="range"]');
    rangeSliders.forEach(slider => {
        const output = document.createElement('div');
        output.className = 'text-primary font-bold text-lg';
        output.textContent = formatCurrency(slider.value);
        slider.parentNode.insertBefore(output, slider.nextSibling);
        
        slider.addEventListener('input', () => {
            output.textContent = formatCurrency(slider.value);
        });
    });
    
    // Format currency helper
    function formatCurrency(amount) {
        return 'Rp ' + parseInt(amount).toLocaleString('id-ID');
    }
    
    // Mobile menu toggle
    const mobileMenuButton = document.querySelector('[data-mobile-menu]');
    if (mobileMenuButton) {
        mobileMenuButton.addEventListener('click', () => {
            const mobileMenu = document.querySelector('[data-mobile-menu-target]');
            mobileMenu.classList.toggle('hidden');
        });
    }
    
    // Package saving simulation
    const saveButtons = document.querySelectorAll('button:contains("Start Saving")');
    saveButtons.forEach(button => {
        button.addEventListener('click', () => {
            // In a real app, this would redirect to login/signup or the package detail page
            alert('Please login or sign up to start saving for this package!');
        });
    });

    // Package Filtering and Sorting
    const packageFilters = document.getElementById('package-filters');
    if (packageFilters) {
        const filterSelects = packageFilters.querySelectorAll('select');
        
        const filterAndSortPackages = () => {
            const destination = document.getElementById('filter-destination').value;
            const budget = document.getElementById('filter-budget').value;
            const duration = document.getElementById('filter-duration').value;
            const sortBy = document.getElementById('filter-sort').value;

            const packageGrid = document.getElementById('package-grid');
            const packages = Array.from(packageGrid.querySelectorAll('.package-item'));

            // 1. Filter packages
            packages.forEach(pkg => {
                const pkgDestination = pkg.dataset.destination;
                const pkgPrice = parseInt(pkg.dataset.price);
                const pkgDuration = parseInt(pkg.dataset.duration);

                // Destination check
                const destinationMatch = destination === 'All Destinations' || pkgDestination === destination;

                // Budget check
                let budgetMatch = true;
                if (budget !== 'all') {
                    const [minBudget, maxBudget] = budget.split('-').map(Number);
                    budgetMatch = pkgPrice >= minBudget && pkgPrice <= maxBudget;
                }

                // Duration check
                let durationMatch = true;
                if (duration !== 'all') {
                    const [minDuration, maxDuration] = duration.split('-').map(Number);
                    durationMatch = pkgDuration >= minDuration && pkgDuration <= maxDuration;
                }

                // Show or hide based on matches
                if (destinationMatch && budgetMatch && durationMatch) {
                    pkg.style.display = 'block';
                } else {
                    pkg.style.display = 'none';
                }
            });

            // 2. Sort visible packages
            const visiblePackages = packages.filter(pkg => pkg.style.display !== 'none');

            visiblePackages.sort((a, b) => {
                switch (sortBy) {
                    case 'price-asc':
                        return parseInt(a.dataset.price) - parseInt(b.dataset.price);
                    case 'price-desc':
                        return parseInt(b.dataset.price) - parseInt(a.dataset.price);
                    case 'popular':
                    default:
                        return parseInt(b.dataset.popularity) - parseInt(a.dataset.popularity);
                }
            });

            // 3. Re-append sorted packages to the grid
            visiblePackages.forEach(pkg => packageGrid.appendChild(pkg));
        };

        // Add event listener to all filter selects
        filterSelects.forEach(select => select.addEventListener('change', filterAndSortPackages));
    }

    // Payment method toggle for design-trip.html
    const paymentRadios = document.querySelectorAll('input[name="payment-method"]');
    const cashDetails = document.getElementById('cash-details');
    const cashlessDetails = document.getElementById('cashless-details');

    if (paymentRadios.length > 0 && cashDetails && cashlessDetails) {
        paymentRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'cash') {
                    cashDetails.classList.remove('hidden');
                    cashlessDetails.classList.add('hidden');
                } else {
                    cashDetails.classList.add('hidden');
                    cashlessDetails.classList.remove('hidden');
                }
            });
        });
    }
});
