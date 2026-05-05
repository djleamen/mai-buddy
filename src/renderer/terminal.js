/* Terminal window renderer. Uses window.terminalAPI exposed by terminal-preload.js. */
(function () {
  const output = document.getElementById('output');

  window.terminalAPI.onOutput((data) => {
    output.textContent = String(data ?? '');
    window.scrollTo(0, document.body.scrollHeight);
  });

  window.terminalAPI.onCommand((command) => {
    const cmdDiv = document.createElement('div');
    cmdDiv.className = 'command';
    cmdDiv.textContent = '$ ' + String(command ?? '');
    output.appendChild(cmdDiv);
    window.scrollTo(0, document.body.scrollHeight);
  });

  window.terminalAPI.onClear(() => {
    output.textContent = '';
  });
})();
