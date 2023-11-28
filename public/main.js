document.addEventListener("visibilitychange", function () {
    htmx.ajax('GET', '/', '#content');

});

window.addEventListener('focus', function () {
    htmx.ajax('GET', '/', '#content');
});