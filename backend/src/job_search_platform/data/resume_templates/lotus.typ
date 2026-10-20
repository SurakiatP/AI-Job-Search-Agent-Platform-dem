// Lotus: single column in the Thai application style; a portrait photo beside the name, contact lines stacked.
#import "common.typ": *
#show: setup
#set page(paper: "a4", margin: (x: 1.7cm, y: 1.5cm), footer: page-footer)

#let header = [
  #text(font: serif, size: 23pt, weight: "bold")[#data.basics.name]
  #if filled(data.basics.headline) { v(-7pt); text(size: 11pt, fill: accent, weight: "medium")[#data.basics.headline] }
  #v(3pt)
  #set text(size: 9pt)
  #contacts().join(linebreak())
]
#if has-photo {
  grid(columns: (1fr, 2.7cm), column-gutter: 16pt, align(horizon, header), photo(2.7cm))
} else { header }
#v(6pt)
#line(length: 100%, stroke: 1.4pt + accent)

#for name in data.order.filter(shown) {
  v(13pt, weak: true)
  heading-block[
    #grid(columns: (auto, 1fr), column-gutter: 8pt, align: horizon,
      text(size: 11.5pt, weight: "bold", fill: accent)[#labels.at(name)],
      line(length: 100%, stroke: 0.5pt + accent.lighten(55%)))
  ]
  body(name)
}
