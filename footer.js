/**
 * Shared Footer Component
 * Injects the global footer into the page.
 */
(function() {
    const currentYear = new Date().getFullYear();
    const footerHTML = `
    <footer>
        <div class="container">
            <div class="footer-column">
                <p class="footer-label">Vasilina Panina</p>
                <p lang="en" style="opacity: 0.7; text-transform: none; letter-spacing: 0; line-height: 1.8; max-width: 280px;">Editorial model and creative director based in Bangkok. Experienced, intuitive, and passionate about the craft.</p>
                <p lang="th" style="opacity: 0.7; text-transform: none; letter-spacing: 0; line-height: 1.8; max-width: 280px;">นางแบบและครีเอทีฟไดเรกเตอร์ผู้มากประสบการณ์ในวงการแฟชั่นระดับสากล ปัจจุบันประจำอยู่ที่กรุงเทพฯ</p>
            </div>
            <div class="footer-column">
                <p class="footer-label" lang="en">Inquiries</p>
                <p class="footer-label" lang="th">ติดต่อสอบถาม</p>
                <a href="mailto:vasilina@fashion.com">vasilina.panina2100@gmail.com</a>
                <a href="booking.html">Booking & Availability</a>
            </div>
            <div class="footer-column">
                <p class="footer-label" lang="en">Follow</p>
                <p class="footer-label" lang="th">ติดตาม</p>
                <a href="https://www.instagram.com/paninavasilina/" target="_blank" rel="noopener noreferrer">Instagram</a>
                <a href="https://www.instagram.com/charizma.management/" target="_blank" rel="noopener noreferrer">Charizma Management</a>
            </div>
            <div class="footer-bottom">
                <div>&copy; ${currentYear} Vasilina Panina Portfolio. All rights reserved.</div>
                <div class="attribution">Design & Development by <a href="mailto:tanpkh97@gmail.com" class="designer-link">Tan Patipan</a></div>
            </div>
        </div>
    </footer>`;

    document.currentScript.insertAdjacentHTML('beforebegin', footerHTML);
})();