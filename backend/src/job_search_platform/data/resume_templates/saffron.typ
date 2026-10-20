// Saffron: a full-width accent header with a round photo, name and contact; one column of sections below.
#import "common.typ": *
#show: setup
#let mx = 1.6cm
#set page(paper: "a4", margin: (x: mx, top: 1.4cm, bottom: 1.4cm), footer: page-footer)

#pad(x: -mx, top: -1.4cm)[
  #block(width: 100%, fill: accent, inset: (x: mx, top: 1.1cm, bottom: 0.9cm))[
    #set text(fill: white)
    #show link: it => text(fill: white, it)
    #let who = [
      #text(size: 22pt, weight: "bold")[#data.basics.name]
      #if filled(data.basics.headline) { v(-6pt); text(size: 11pt)[#data.basics.headline] }
      #v(2pt)
      #text(size: 8.8pt)[#contacts(link-fill: white).join(h(5pt) + [·] + h(5pt))]
    ]
    #if has-photo {
      grid(columns: (2.8cm, 1fr), column-gutter: 18pt, align: horizon, photo(2.8cm, round: true, ring: 2.5pt + white), who)
    } else { who }
  ]
]

#for name in data.order.filter(shown) {
  v(13pt, weak: true)
  heading-block[
    #text(size: 11.5pt, weight: "bold", fill: accent)[#labels.at(name)]
    #v(-7pt)
    #line(length: 2.2cm, stroke: 1.6pt + accent)
  ]
  body(name)
}
