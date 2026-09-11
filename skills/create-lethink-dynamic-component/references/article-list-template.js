(function () {
  // 数据请求、筛选和分页由 CMS 通用运行时负责，这里只补充键盘与可访问性。
  var roots = document.querySelectorAll('.lethink-news-list');
  Array.prototype.forEach.call(roots, function (root) {
    if (root.__newsListAccessible) return;
    root.__newsListAccessible = true;
    var pagination = root.querySelector('[data-lethink-pagination]');

    function syncPagination() {
      if (!pagination) return;
      var current = pagination.querySelector('.on');
      var currentPage = current && current.getAttribute('data-page');
      Array.prototype.forEach.call(pagination.querySelectorAll('a'), function (link) {
        var prev = link.classList.contains('prev');
        var next = link.classList.contains('next');
        link.setAttribute('aria-label', prev ? '上一页' : next ? '下一页' : '第 ' + link.textContent + ' 页');
        var disabled = (prev || next) && link.getAttribute('data-page') === currentPage;
        link.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        link.tabIndex = disabled ? -1 : 0;
        if (link === current) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }
    if (pagination) new MutationObserver(syncPagination).observe(pagination, { childList: true });
    syncPagination();

    Array.prototype.forEach.call(root.querySelectorAll('.lethink-news-list__select'), function (select) {
      var head = select.querySelector('p');
      var list = select.querySelector('ul');
      function syncSelect() {
        head.setAttribute('aria-expanded', list.style.display === 'block' ? 'true' : 'false');
        Array.prototype.forEach.call(list.children, function (item) {
          item.tabIndex = 0;
          item.setAttribute('role', 'button');
        });
      }
      new MutationObserver(syncSelect).observe(list, { childList: true, attributes: true, attributeFilter: ['style'] });
      syncSelect();
    });

    root.addEventListener('keydown', function (event) {
      var target = event.target;
      var select = target.closest('.lethink-news-list__select');
      if (!select || !root.contains(select)) return;
      var list = select.querySelector('ul');
      var head = select.querySelector('p');
      if (event.key === 'Escape') {
        list.style.display = 'none';
        head.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        target.click();
        if (target === head && list.style.display === 'block' && list.firstElementChild) list.firstElementChild.focus();
        else if (target.tagName === 'LI') head.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (target === head) {
          list.style.display = 'block';
          if (list.firstElementChild) list.firstElementChild.focus();
        } else {
          var sibling = event.key === 'ArrowDown' ? target.nextElementSibling : target.previousElementSibling;
          if (sibling) sibling.focus();
        }
      }
    });
    root.addEventListener('click', function (event) {
      var disabledLink = event.target.closest('[data-lethink-pagination] a[aria-disabled="true"]');
      if (disabledLink) { event.preventDefault(); event.stopImmediatePropagation(); }
      if (!event.target.closest('.lethink-news-list__select')) {
        Array.prototype.forEach.call(root.querySelectorAll('.lethink-news-list__select > ul'), function (list) { list.style.display = 'none'; });
      }
    }, true);
  });
})();
