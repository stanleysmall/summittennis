// Initialize Google Analytics
(function() {
  window.dataLayer = window.dataLayer || [];
  
  function gtag() {
    dataLayer.push(arguments);
  }
  
  gtag('js', new Date());
  gtag('config', CONFIG.GA_TRACKING_ID);
  
  // Dynamically load GA script
  const gaScript = document.createElement('script');
  gaScript.async = true;
  gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${CONFIG.GA_TRACKING_ID}`;
  document.head.appendChild(gaScript);
})();
