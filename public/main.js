

document.addEventListener("visibilitychange", function () {
    if (window.location.pathname === '/') {
        htmx.ajax('GET', '/', { target: "body", swap: "morph:innerHTML" });
    }
});

window.addEventListener('focus', function () {
    if (window.location.pathname === '/') {
        htmx.ajax('GET', '/', { target: "body", swap: "morph:innerHTML" });
    }
});


