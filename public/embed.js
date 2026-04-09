(function () {
  'use strict';

  var GuidonWholesale = {
    init: function (options) {
      options = options || {};
      var target = options.target || '#guidon-wholesale';
      var type = options.type || 'order'; // 'order' or 'portal'
      var baseUrl = options.baseUrl || window.location.origin;

      var container = typeof target === 'string' ? document.querySelector(target) : target;
      if (!container) {
        console.error('Guidon Wholesale: Target element not found:', target);
        return;
      }

      var iframe = document.createElement('iframe');
      iframe.src = baseUrl + '/embed/' + type;
      iframe.style.width = '100%';
      iframe.style.border = 'none';
      iframe.style.minHeight = '600px';
      iframe.style.transition = 'height 0.3s ease';
      iframe.setAttribute('title', 'Guidon Brewing Wholesale ' + type);
      iframe.setAttribute('loading', 'lazy');

      container.appendChild(iframe);

      // Auto-height via postMessage
      window.addEventListener('message', function (event) {
        if (event.data && event.data.type === 'guidon-resize') {
          iframe.style.height = event.data.height + 'px';
        }
      });

      return iframe;
    },
  };

  // Expose globally
  if (typeof window !== 'undefined') {
    window.GuidonWholesale = GuidonWholesale;
  }
})();
