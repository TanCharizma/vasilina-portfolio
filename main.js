/**
 * Shared Main JavaScript
 * Handles global reveal animations, modals, and homepage-specific interactions.
 */
document.addEventListener('DOMContentLoaded', () => {
    
    // Cache viewport height globally for scroll calculations
    let vh = window.innerHeight;
    window.addEventListener('resize', () => vh = window.innerHeight, { passive: true });
    
    // --- 1. GLOBAL REVEAL ANIMATIONS ---
    const revealOptions = {
        threshold: 0,
        rootMargin: "0px 0px -200px 0px"
    };

    const revealObserver = new IntersectionObserver((entries) => {
        let toReveal = entries.filter(e => e.isIntersecting && !e.target.classList.contains('active'));

        if (toReveal.length > 1) {
            toReveal.sort((a, b) => {
                const rectA = a.boundingClientRect;
                const rectB = b.boundingClientRect;
                if (Math.abs(rectA.top - rectB.top) > 100) {
                    return rectA.top - rectB.top;
                }
                return rectA.left - rectB.left;
            });
        }

        toReveal.forEach((entry, index) => {
            const el = entry.target;
            if (!Array.from(el.classList).some(cls => cls.startsWith('delay-'))) {
                el.style.transitionDelay = `${index * 0.1}s`;
            }

            const images = el.tagName === 'IMG' ? [el] : Array.from(el.querySelectorAll('img'));
            const pendingImages = images.filter(img => !img.complete);

            const triggerActive = () => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => el.classList.add('active'));
                });
                revealObserver.unobserve(el);
            };

            if (pendingImages.length > 0) {
                let loadedCount = 0;
                pendingImages.forEach(img => {
                    const checkLoad = () => {
                        loadedCount++;
                        if (loadedCount === pendingImages.length) triggerActive();
                    };
                    img.addEventListener('load', checkLoad, { once: true });
                    img.addEventListener('error', checkLoad, { once: true });
                });
            } else {
                triggerActive();
            }
        });
    }, revealOptions);

    // Select reveal targets (exclude hero reveals if on homepage to let hero loader handle them)
    const isHomePage = document.getElementById('hero') !== null;
    const revealTargets = isHomePage 
        ? document.querySelectorAll('.reveal:not(.hero .reveal)') 
        : document.querySelectorAll('.reveal');
        
    revealTargets.forEach(el => revealObserver.observe(el));


    // --- 2. HOMEPAGE SPECIFIC LOGIC ---
    if (isHomePage) {
        // Navigation Active State Observer
        const navOptions = { root: null, threshold: 0, rootMargin: "-80px 0px -80% 0px" };
        const navObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('id');
                    if (['hero', 'highlights', 'portfolio', 'motion', 'measurements', 'digitals'].includes(id)) {
                        document.querySelectorAll('.nav-links a, .dropdown-trigger').forEach(el => el.classList.remove('active'));
                        const trigger = document.querySelector('.dropdown-trigger');
                        if (trigger) trigger.classList.add('active');
                        const subLink = document.querySelector(`.dropdown-content a[href="#${id}"], .dropdown-content a[href="index.html#${id}"]`);
                        if (subLink) subLink.classList.add('active');
                    }
                }
            });
        }, navOptions);
        document.querySelectorAll('header[id], section[id]').forEach(section => navObserver.observe(section));

        // Hero Entrance & Parallax
        const heroSection = document.getElementById('hero');
        const heroBg = document.querySelector('.hero-bg');
        const heroContent = document.querySelector('.hero-content');
        
        // Determine correct hero image path based on version
        const heroImgUrl = heroBg.style.backgroundImage.includes('placeholder-hero') 
            ? 'image/placeholder-hero.webp' 
            : 'image/hero/hero.webp';
            
        const heroImgLoader = new Image();
        heroImgLoader.src = heroImgUrl;

        const triggerHeroEntrance = () => {
            heroSection.classList.add('loaded');
            document.querySelectorAll('.hero .reveal').forEach(el => el.classList.add('active'));
        };

        if (heroImgLoader.complete) { triggerHeroEntrance(); } 
        else {
            heroImgLoader.addEventListener('load', triggerHeroEntrance);
            heroImgLoader.addEventListener('error', triggerHeroEntrance);
        }

        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const scrollOffset = window.scrollY;
                    if (scrollOffset <= vh) {
                        if (scrollOffset > 0 && heroBg.style.animation !== 'none') { heroBg.style.animation = 'none'; }
                        if (window.innerWidth > 768) {
                            const scale = 1 + (scrollOffset / vh) * 0.4; 
                            const parallax = scrollOffset * 0.15;
                            heroBg.style.transform = `scale(${scale}) translate3d(0, ${parallax}px, 0)`;
                        } else {
                            const scale = 1 + (scrollOffset / vh) * 0.15;
                            heroBg.style.transform = `scale(${scale}) translateZ(0)`;
                        }
                        heroContent.style.opacity = Math.max(0, 1 - (scrollOffset / (vh * 0.6)));
                    }
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });
    }

    // --- 3. BACK TO TOP LOGIC ---
    const backToTop = document.querySelector('.back-to-top');
    if (backToTop) {
        let isScrollingToTop = false;
        let scrollCheckInterval = null;
        let scrollTimeout = null;

        const evaluateBackToTop = () => {
            if (!backToTop || isScrollingToTop) return;
            if (window.scrollY > (vh * 0.5)) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        };

        backToTop.addEventListener('click', (e) => {
            e.preventDefault();
            isScrollingToTop = true;
            backToTop.style.opacity = '0';
            backToTop.style.pointerEvents = 'none';
            backToTop.classList.remove('visible');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            clearInterval(scrollCheckInterval);
            clearTimeout(scrollTimeout);

            const unlockButton = () => {
                isScrollingToTop = false;
                backToTop.style.opacity = '';
                backToTop.style.pointerEvents = '';
                evaluateBackToTop();
            };

            scrollCheckInterval = setInterval(() => {
                if (window.scrollY <= 0) {
                    clearInterval(scrollCheckInterval);
                    clearTimeout(scrollTimeout);
                    unlockButton();
                }
            }, 100);

            scrollTimeout = setTimeout(() => {
                clearInterval(scrollCheckInterval);
                unlockButton();
            }, 2000);
        });

        const interruptScroll = () => {
            if (isScrollingToTop) {
                clearInterval(scrollCheckInterval);
                clearTimeout(scrollTimeout);
                isScrollingToTop = false;
                backToTop.style.opacity = '';
                backToTop.style.pointerEvents = '';
                evaluateBackToTop();
            }
        };

        window.addEventListener('touchstart', interruptScroll, { passive: true });
        window.addEventListener('wheel', interruptScroll, { passive: true });
        window.addEventListener('scroll', () => window.requestAnimationFrame(evaluateBackToTop), { passive: true });
    }

    // --- 4. IMAGE MODAL LOGIC (With Keyboard Support) ---
    const modal = document.getElementById("imageModal");
    if (modal) {
        const modalImg = document.getElementById("img01");
        let currentSectionImages = [];
        let currentImgIndex = 0;
        
        const updateModal = (index) => {
            currentImgIndex = index;
            modalImg.src = currentSectionImages[currentImgIndex].src;
            modalImg.alt = currentSectionImages[currentImgIndex].alt || 'Expanded portfolio image';
            document.querySelector('.modal-prev').style.visibility = currentImgIndex === 0 ? 'hidden' : 'visible';
            document.querySelector('.modal-next').style.visibility = currentImgIndex === currentSectionImages.length - 1 ? 'hidden' : 'visible';
        };

        // Filter out any image that is a brand logo (by class or by folder path)
        const galleryImages = Array.from(document.querySelectorAll('section img')).filter(img => {
            return !img.classList.contains('brand-logo') && !img.src.includes('brand_icons');
        });

        galleryImages.forEach((img) => {
            img.style.cursor = 'pointer';
            img.addEventListener('click', () => {
                const parentSection = img.closest('section');
                currentSectionImages = Array.from(parentSection.querySelectorAll('img'))
                    .filter(i => !i.classList.contains('brand-logo') && !i.src.includes('brand_icons'))
                    .sort((a, b) => Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) > 100 
                        ? a.getBoundingClientRect().top - b.getBoundingClientRect().top 
                        : a.getBoundingClientRect().left - b.getBoundingClientRect().left);
                modal.style.display = "block";
                updateModal(currentSectionImages.indexOf(img));
                document.body.style.overflow = 'hidden';
            });
        });

        document.querySelector('.modal-prev').onclick = (e) => { e.stopPropagation(); updateModal(currentImgIndex - 1); };
        document.querySelector('.modal-next').onclick = (e) => { e.stopPropagation(); updateModal(currentImgIndex + 1); };
        modalImg.onclick = (e) => e.stopPropagation();
        
        const closeModal = () => {
            modal.style.display = "none";
            document.body.style.overflow = 'auto';
        };
        
        modal.onclick = closeModal;

        // Added Keyboard UX for premium navigation
        document.addEventListener('keydown', (e) => {
            if (modal.style.display === "block") {
                if (e.key === 'Escape') closeModal();
                if (e.key === 'ArrowLeft' && currentImgIndex > 0) updateModal(currentImgIndex - 1);
                if (e.key === 'ArrowRight' && currentImgIndex < currentSectionImages.length - 1) updateModal(currentImgIndex + 1);
            }
        });
        
        // Global Escape Key for Comp Card Modal
        document.addEventListener('keydown', (e) => {
            const compModal = document.getElementById('compCardModal');
            if (e.key === 'Escape' && compModal && compModal.style.display === "block") {
                compModal.style.display = "none";
                document.body.style.overflow = 'auto';
            }
        });
    }

    // --- 5. COMP CARD LOGIC ---
    const compCardBtn = document.getElementById('compCardBtn');
    const compCardModal = document.getElementById('compCardModal');
    const compCardImg = document.getElementById('compCardImg');
    const compCardDownload = document.getElementById('compCardDownload');

    if (compCardBtn && compCardModal) {
        compCardBtn.addEventListener('click', (e) => {
            e.preventDefault();
            compCardModal.style.display = "block";
            document.body.style.overflow = 'hidden'; // Stop background scrolling
        });

        compCardModal.onclick = (e) => {
            // Close if clicking the background, but don't close if clicking the image or download button
            if (e.target !== compCardImg && !compCardDownload.contains(e.target)) {
                compCardModal.style.display = "none";
                document.body.style.overflow = 'auto';
            }
        };
    }
});