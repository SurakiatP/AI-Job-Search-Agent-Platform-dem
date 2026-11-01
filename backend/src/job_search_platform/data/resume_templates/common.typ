// Shared parts of the resume templates. User data is read with json() and only ever printed as text.
#let data = json("resume.json")
#let labels = json("labels.json")
#let theme = json("theme.json")
#let accent = rgb(theme.accent)
#let muted = rgb("#4B5563")
#let sans = ("Open Sans", "Noto Sans Thai")
#let serif = ("Libertinus Serif", "Noto Serif Thai")

// SPEC-RTH theme tokens. Each has a default equal to the original look, so templates without tokens render as before.
#let tok(key, default) = theme.at(key, default: default)
#let body-font = if tok("font_pair", "sans") == "serif" { serif } else { sans }
#let body-size = (small: 9.2pt, normal: 9.8pt, large: 10.6pt).at(tok("size", "normal"))
#let dens = (compact: 0.8, normal: 1.0, relaxed: 1.25).at(tok("density", "normal"))

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

// `link-fill` colours profile links; on an accent background pass white, or they vanish into it.
#let contacts(link-fill: none) = {
  let b = data.basics
  let parts = (theme.address, b.email, b.phone).filter(filled).map(v => [#v])
  let label(p) = if filled(p.network) { p.network } else { p.url }
  parts += b.profiles.filter(p => filled(p.url)).map(p => link(p.url, if link-fill == none { label(p) } else { text(fill: link-fill, label(p)) }))
  parts
}

#let row(left, right) = grid(columns: (1fr, auto), column-gutter: 10pt, left, align(end, text(size: 8.5pt, fill: muted)[#right]))
#let sub(value) = if filled(value) { text(fill: muted)[#value] }
#let bullets(items) = {
  let kept = items.filter(filled)
  if kept.len() > 0 { list(spacing: 0.45em * dens, ..kept.map(h => [#h])) }
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
    (strong(item.name),
     if item.keywords.filter(filled).len() > 0 { text(size: 9pt, fill: muted)[#join(item.keywords, sep: ", ")] })
  } else if name == "languages" {
    ([#strong(item.name)#if filled(item.level) [ — #item.level]],)
  } else {
    ([#item.name],)
  }
  stack(spacing: 4pt * dens, ..parts.filter(p => p != none))
}

// Section body; templates choose how headings look and how many skill columns fit.
#let body-raw(name, skill-columns: 2, color: accent) = {
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
      stack(spacing: 9pt * dens, ..items.map(i => block(breakable: entry-breakable(i), width: 100%, entry(name, i, color: color))))
    }
  }
}

// Preview of an unfinished CV: parts filled with invented content get an amber tint, a bar and a note (never on real CVs).
#let sample-parts = theme.at("sample", default: (parts: (), note: "")).parts
#let body(name, ..args) = {
  let inner = body-raw(name, ..args)
  if name in sample-parts {
    block(width: 100%, fill: rgb("#FEF3C7"), stroke: (left: 2.5pt + rgb("#B45309")), radius: 2pt, inset: (x: 7pt, y: 5pt), {
      text(size: 7.5pt, weight: "bold", fill: rgb("#92400E"))[#theme.sample.note]
      v(3pt)
      inner
    })
  } else { inner }
}

// The owner's photo (CR-CVT-01), only in photo templates. 3:4 portrait, or a circle cut from its upper part.
#let has-photo = theme.at("photo", default: none) != none
#let photo(width, round: false, ring: none) = if has-photo {
  let height = if round { width } else { width * 4 / 3 }
  box(width: width, height: height, radius: if round { 50% } else { 2pt }, clip: true,
    stroke: ring, image(theme.photo, width: 100%, height: width * 4 / 3, fit: "cover"))
}

// A heading never sits alone at the bottom of a page: it sticks to what follows it.
// `heading_style`: plain (as before), rule (accent line under it) or band (10% accent tint behind it).
#let heading-block(content) = {
  let style = tok("heading_style", "plain")
  let inner = if style == "band" {
    block(width: 100%, fill: color.mix((white, 90%), (accent, 10%), space: rgb), inset: (x: 5pt, y: 3pt), radius: 2pt, content)
  } else if style == "rule" {
    stack(spacing: 3pt, content, line(length: 100%, stroke: 0.6pt + accent))
  } else { content }
  block(sticky: true, below: 6pt * dens, width: 100%, inner)
}

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
  set text(font: body-font, size: body-size, lang: theme.lang, fill: rgb("#111827"))
  set par(leading: 0.72em * dens, justify: false)
  set list(indent: 2pt, body-indent: 6pt, marker: text(fill: accent)[•])
  show link: it => text(fill: accent, it)
  doc
}
