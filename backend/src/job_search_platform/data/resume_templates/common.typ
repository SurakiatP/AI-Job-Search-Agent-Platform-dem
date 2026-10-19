// Shared parts of the resume templates. User data is read with json() and only ever printed as text.
#let data = json("resume.json")
#let labels = json("labels.json")
#let theme = json("theme.json")
#let accent = rgb(theme.accent)
#let muted = rgb("#4B5563")
#let sans = ("Open Sans", "Noto Sans Thai")
#let serif = ("Libertinus Serif", "Noto Serif Thai")

#let filled(s) = type(s) == str and s.trim() != ""
#let join(parts, sep: " · ") = {
  let kept = parts.filter(filled)
  if kept.len() == 0 { "" } else { kept.join(sep) }
}
#let period(item) = {
  let start = item.at("start", default: item.at("date", default: ""))
  let end = if item.at("current", default: false) { labels.present } else { item.at("end", default: "") }
  join((start, end), sep: " – ")
}

#let shown(name) = {
  if name == "personal" {
    theme.personal.len() > 0
  } else if name == "summary" {
    not data.at("summary_hidden", default: false) and filled(data.summary.content)
  } else if name == "references" and theme.references_on_request {
    not data.sections.references.hidden
  } else {
    let s = data.sections.at(name)
    not s.hidden and s.items.len() > 0
  }
}

#let contacts() = {
  let b = data.basics
  let parts = (theme.address, b.email, b.phone).filter(filled).map(v => [#v])
  parts += b.profiles.filter(p => filled(p.url)).map(p => link(p.url)[#if filled(p.network) { p.network } else { p.url }])
  parts
}

#let row(left, right) = grid(columns: (1fr, auto), column-gutter: 10pt, left, align(end, text(size: 8.5pt, fill: muted)[#right]))
#let sub(value) = if filled(value) { text(fill: muted)[#value] }
#let bullets(items) = {
  let kept = items.filter(filled)
  if kept.len() > 0 { list(spacing: 0.45em, ..kept.map(h => [#h])) }
}
#let level-dots(level, color) = if level != none {
  let dot(on) = box(width: 5pt, height: 5pt, radius: 1pt, fill: if on { color } else { none }, stroke: 0.6pt + color)
  box(stack(dir: ltr, spacing: 2.5pt, ..range(5).map(i => dot(i < level))))
}

#let link-or(url, label) = if filled(url) { link(url)[#label] } else { label }

// Long entries may split across pages; short ones move whole to the next page.
#let entry-breakable(item) = item.at("highlights", default: ()).len() > 4

// One entry as a tight stack: title line (with dates on the right), a muted line, then bullets.
#let entry(name, item, color: accent) = {
  let parts = if name == "experience" {
    (row(strong(item.position), period(item)), sub(join((item.company, item.location))), bullets(item.highlights))
  } else if name == "projects" {
    (row(strong(link-or(item.url, item.name)), period(item)), sub(item.role), bullets(item.highlights))
  } else if name == "volunteer" {
    (row(strong(item.role), period(item)), sub(item.organization), bullets(item.highlights))
  } else if name == "education" {
    (row(strong(item.institution), period(item)), sub(join((item.degree, item.area, item.grade), sep: ", ")))
  } else if name == "certifications" {
    (row(strong(link-or(item.url, item.name)), item.date), sub(item.issuer))
  } else if name == "awards" {
    (row(strong(item.title), item.date), sub(item.awarder), if filled(item.summary) [#item.summary])
  } else if name == "publications" {
    (row(strong(link-or(item.url, item.title)), item.date), sub(item.publisher))
  } else if name == "references" {
    (strong(item.name), sub(join((item.relation, item.contact))))
  } else if name == "skills" {
    ([#strong(item.name) #h(4pt) #level-dots(item.level, color)],
     if item.keywords.filter(filled).len() > 0 { text(size: 9pt, fill: muted)[#join(item.keywords, sep: ", ")] })
  } else if name == "languages" {
    ([#strong(item.name)#if filled(item.level) [ — #item.level]],)
  } else {
    ([#item.name],)
  }
  stack(spacing: 4pt, ..parts.filter(p => p != none))
}

// Section body; templates choose how headings look and how many skill columns fit.
#let body(name, skill-columns: 2, color: accent) = {
  if name == "personal" {
    grid(columns: (auto, 1fr), column-gutter: 12pt, row-gutter: 5pt,
      ..theme.personal.map(r => (text(fill: muted)[#r.at(0)], [#r.at(1)])).flatten())
  } else if name == "summary" {
    par[#data.summary.content]
  } else if name == "references" and theme.references_on_request {
    text(fill: muted)[#labels.on_request]
  } else {
    let items = data.sections.at(name).items
    if name == "interests" {
      [#join(items.map(i => i.name))]
    } else if name == "skills" {
      grid(columns: (1fr,) * skill-columns, column-gutter: 12pt, row-gutter: 8pt, ..items.map(i => entry(name, i, color: color)))
    } else {
      stack(spacing: 9pt, ..items.map(i => block(breakable: entry-breakable(i), width: 100%, entry(name, i, color: color))))
    }
  }
}

// A heading never sits alone at the bottom of a page: it sticks to what follows it.
#let heading-block(content) = block(sticky: true, below: 6pt, width: 100%, content)

// From page 2: the owner's name and "Page n/total", so loose printed pages can be matched up.
#let page-footer = context {
  let n = counter(page).get().first()
  if n > 1 {
    set text(size: 8pt, fill: muted)
    grid(columns: (1fr, auto), data.basics.name, [#labels.page #n/#counter(page).final().first()])
  }
}

#let setup(doc) = {
  set document(title: data.basics.name)
  set text(font: sans, size: 9.8pt, lang: theme.lang, fill: rgb("#111827"))
  set par(leading: 0.72em, justify: false)
  set list(indent: 2pt, body-indent: 6pt, marker: text(fill: accent)[•])
  show link: it => text(fill: accent, it)
  doc
}
