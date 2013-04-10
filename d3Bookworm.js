//There should always be a query variable present: from that, it should be possible to derive anything else we'll ever need, and any changes can update it directly.
//This is the cardinal rule of the architecture here: absolutely any state must DRAW FROM and UPDATE the query variable.
//If anyone violates this rule...

var query = {};

var defaultQuery = {
    "method":"return_json",
    "words_collation":"Case_Sensitive",
    "groups":["lat","lng"],
    "database":"ChronAm",
    "counttype":["WordCount","TotalWords","WordsPerMillion"],
    "search_limits":{
        "date_year":{"$lte":1922,"$gte":1850},
        "word":["Ohio river"]
    },
    "plotType":"map"
};

if (window.location.host=="melville.seas.harvard.edu") {
    defaultQuery = {
        "method":"return_json",
        "words_collation":"Case_Sensitive",
        "groups":["year","classification"],
        "database":"presidio",
        "counttype":["WordCount","TotalWords","WordsPerMillion"],
        "search_limits":{
            "year":{"$lte":1922,"$gte":1850},
            "word":["library","libraries"]
        },
        "plotType":"heatMap"
    }
}

var lastPlotted="None"

//Graphical Elements
var w = window.innerWidth
var h = window.innerHeight

//Things for everywhere
var svg = d3.select("#chart")
    .append("svg")
    .attr('width',w)
    .attr('height',h)

var width = 'f'

//These are the things to delete when a new chart is refreshed.
//They contain the various aspects of the actual plot

var bottomLevel = svg.append("g").attr("id", "#bottomLevel")
var maplevel = svg.append("g").attr("id", "#maplevel")
var paperdiv = svg.append("g").attr("id","#paperdiv");
var yaxis = svg.append("g").attr("id","#yaxis");
var xaxis = svg.append("g").attr("id","#xaxis");
var legend = svg.append('g').attr('id','#legend');
var colorLegend = legend.append('g').attr('id','colorLegend').attr('transform','translate(' + w/25+ ','+h/7+')');
var sizeLegend = legend.append('g').attr('id','sizeLegend').attr('transform','translate('+(w/25 + 100) +','+(h/5) + ')');
var title = svg.append('g').attr('id','title').attr('transform','translate(' + w*.4+ ',' + 50  +')');


// Things for the background map
var projection = {"mapname":"none"}
var stateItems;

// Prepare the paper points.
// These variables should be renamed for clarity: 'paper' refers to newspapers, for legacy reasons.
var paperdata = [];

var paperpoints = paperdiv
    .selectAll("circle")
    .data(paperdata,function(d) {d.key})

var gridRects = paperdiv
    .selectAll('rect')


//Pull query from hash location iff supplied
if(window.location.hash) {
    var hash = window.location.hash.substring(1);
    decoded = decodeURIComponent(hash)
    query =  JSON.parse(decoded)
} else {
    query = defaultQuery
}

if (!('aesthetic' in query)) {
    query['aesthetic']= {
        "color":"WordsPerMillion",
        "size":"WordCount",
        "filterByTop":"WordCount"
    }
}


chooseVariable = function(parentNode,nodeName,variableSet,queryPartBeingUpdated,partOfQueryPartBeingUpdated) {
    //The thing being set here is assumed to be two levels deep in query, based on the variableSet.
    //So, for instance, if queryPartBeingUpdated is 'aesthetic' and partOfQueryPartBeingUpdated is 'color', the 'color' aesthetic
    //will be set to whatever element is clicked on when the click is made.
    //if queryPartBeingUpdated is 'groups' and partOfQueryPartBeingUpdated is 0, (the number, not the string), it will be the x axis being
    //updated. And so forth.

    height=300
    boxwidth=150


    removeOverlay = function() {
	d3.selectAll('#overlay')
	    .transition()
	    .duration(1500)
	    .attr('opacity',0)
	    .remove();
    }

    bottomLevel
	.append('rect')
	.attr('id','overlay')
	.attr('width',w)
	.attr('height',h)
	.attr('fill','white')
	.attr('opacity',0)
	.on('click',function(){
	    removeOverlay();
	    shutWindow();})
	.transition().duration(1500)
	.attr('opacity',0)

    parentNode.selectAll('.selector').remove()
    
    dropdown = parentNode
	.append('g')
	.attr('class','selector')
	.attr('id',nodeName)
    
    dropdown
        .append('rect')
	.attr('width',boxwidth)
	.attr('rx',10)
	.attr('ry',10)
	.attr('x',-boxwidth/2)
        .attr('fill','#DDDDDD')
        .attr('opacity','.98').transition().duration(1000).attr('height',height)

    possibilities = d3.scale.ordinal()
        .range(d3.range(15,height+1, height/variableSet.length))
        .domain(variableSet.map(function(d) {return(d.variable)}))
    
    labels = dropdown
	.selectAll('text')
	.data(variableSet)

    labels
        .enter()
        .append('text')
        .text(function(d) {return(d.label)})
	.style('font-family','sans-serif')
	.style('font-size','9')
	.style('text-anchor','middle')
	.transition().duration(1000)
        .attr('y',function(d) {
            return(possibilities(d.variable))})
        .attr('x',5)

    shutWindow = function() {
        d3.select('#' + nodeName).selectAll('rect')
            .transition().duration(1000)
            .attr('height',0)
            .transition().remove();
        labels
            .transition().duration(1000)
            .attr('y',0)
            .transition()
            .attr('opacity',0)
	    .remove()
    }

    //Overlay box until selection is made.

    labels
        .on('click',function(d) {
	    //when clicked, this is going to update something inside the query 
	    //            query['aesthetic']['color'] = d.variable;
	    query[queryPartBeingUpdated][partOfQueryPartBeingUpdated] = d.variable
	    updateQuery();
	    shutWindow()
	    removeOverlay()
	    currentPlot = myPlot()
	    currentPlot()
	})
}

// And for now I'm just having that query live in a text box. We can use the real Bookworm query entries instead, but no use reinventing that wheel here.
var APIbox = d3.select('#chart')
    .append('input')
    .attr('id','APIbox')
    .attr('type', String)
    .attr('value', JSON.stringify(query))
    .attr('style', 'width: 95%;')
    .on('keyup',function() {
        query = JSON.parse(d3.select("#APIbox").property('value'));
        wordBox.update()
    })


//Well, one re-invention: a word box at the top that automatically updates the text box, and vice-versa.
var wordBox= d3.select('#topSelectors')
    .append('input')
    .attr('id','wordBox')
    .attr('type', String)
    .attr('style', 'width: 350px;')
    .on('keyup',function() {
        query['search_limits']['word'][0] = d3.select("#wordBox").property('value');
        APIbox.update()
    });

try {
    wordBox.attr('value', query['search_limits']['word'][0])
} catch (e) {
    wordBox.attr('value',"")
}
wordBox.update=function() {
    d3.select('#wordBox').property('value',function() {return query['search_limits']['word'][0]});
}

var yearValue;
//could be defined in the database somehow. (But how??)
defaultYear = {"presidio":"year","OL":"publish_year","ChronAm":"date_year","arxiv":"year"}
yearValue = defaultYear[query['database']]

APIbox.update = function() {
    d3.select('#APIbox')
        .property('value',function() {return JSON.stringify(query)}
                 );
}

$(function() {
    $( "#slider-range" ).slider({
        id:"timeSelector",
        range: true,
        min: 1800,
        max: 2000,
        values: [query.search_limits[yearValue]['$gte'], query.search_limits[yearValue]['$lte']],
        slide: function( event, ui ) {
        },
        change: function(event,ui) {
            $( "#amount" ).val( ui.values[ 0 ] + " - " + ui.values[ 1 ] );
            query.search_limits[yearValue]['$gte'] = ui.values[0]
            query.search_limits[yearValue]['$lte'] = ui.values[1]
            APIbox.update()
        }

    });
    $( "#amount" ).val( $( "#slider-range" ).slider( "values", 0 ) +
                        " - " + $( "#slider-range" ).slider( "values", 1 ) );
});

advanceSlider = function(step) {
    if (step==null) {step=10}
    current = $('#slider-range').slider('values');
    range = current[1]-current[0];
    $('#slider-range').slider('values',[current[0]+step,current[1]+step]);
    currentPlot();
}

myPlot = function() {
    if (query.plotType=='heatMap') {return heatMapFactory() }
    if (query.plotType=='map') {return mapQuery()}
}

var executeButtons = $('<div />');
$('<button />').text('Map Query').click(function(){
    query.plotType='map';
    currentPlot = myPlot()
    currentPlot()
}).appendTo(executeButtons);

$('<button />').text('Heatgrid chart').click(function(){
    query.plotType='heatMap';
    currentPlot = myPlot()
    currentPlot()
}).appendTo(executeButtons);

var lastOptions = $('<div />');

//The types of maps are just coded in.
mapOptions = [{"text":'USA','value':"USA"},
              {'text':'World','value':"World"},
              {'text':'Europe','value':"Europe"},
              {'text':'Asia','value':"Asia"}]

mapSelector = d3.select("#lastOptions").append('select').attr('id',"mapChoice")
pointSelector = mapSelector.selectAll('option').data(mapOptions)

pointSelector.enter()
    .append('option')
    .attr('value',function(d){return d.value})
    .text(function(d) {return(d.text)})

scaleTypes = [{'text':'Linear','value':"linear"},
              {"text":'Logarithmic','value':"log"}]

scaleSelector = d3.select("#lastOptions")
    .append('select')
    .attr('id',"scaleType")

scaleOptions = scaleSelector.selectAll('option').data(scaleTypes)

scaleOptions.enter()
    .append('option')
    .attr('value',function(d){return d.value})
    .text(function(d) {return(d.text)})

scaleSelector.on("change",function(d){
    myPlot()()
})


createDropbox = function(category) {
    //Drops in a new query box for a categorical value:
    //going to be useful for other applications, but not implemented here. Possibly the first part should just return the data.

    myQuery = JSON.parse(JSON.stringify(query));
    myQuery['search_limits']['word'] = []
    myQuery['groups'] = [category]
    myQuery['counttype'] = ['WordCount','TextCount']

    dat = d3.json(destinationize(myQuery),function(json) {

        myData = parseBookwormData(json,myQuery);
        topChoices = topn(50,category,myData)

        myData.filter(function(entry) {
            return(topChoices.indexOf(entry[category]) > -1 & entry.WordCount > 0)
        })

        myData.sort(function(a,b) {return(a.WordCount<b.WordCount)})

        thisGuy = d3.select("body")
            .append('select').attr('id',category).attr('multiple','multiple')
        
	thisSelection = thisGuy.selectAll('option').data(myData)
        thisSelection.enter()
            .append('option')
            .attr('value',function(d){
                return d[category]})
            .text(function(d) {
                text = d[category]
                if( d[category]=="") {text = "[value blank]"}
                return text + " (" +prettyName(d.WordCount) + " words in " + prettyName(d.TextCount) + " Texts)"
            })
    })
}


var options = $('<div />');

executeButtons.appendTo($('body'));

$('body').keypress(function(e){
    if(e.which == 13){
        plotting = myPlot();
        plotting()
    }
});



drawMap = function (mapname) {
    mapname = mapname

    my = function() {
        if (mapname!=projection.mapname) {
            maplevel.selectAll('path').remove()
            removeElements()
        }

        sourceJson = "../data/bigearth.json"

        if (mapname=="World") {
            projection = d3.geo.equirectangular()
                .scale([280])
                .translate([w/2,h/2])
                .center([0,0])
        }

        if (mapname=="Asia") {
            projection = d3.geo.azimuthalEqualArea()
                .scale([300])
                .center([0,0])
                .translate([700,350])
                .rotate([0,0,0])
        }
	
        if (mapname=="Europe") {
            projection = d3.geo.albers()
                .center([15,45])
                .parallels([30,55.5])
                .rotate([-10,0])
                .translate([w/2,h/2])
                .scale([d3.min([w,h*2])]);
        }

        if (mapname=="USA") {
            projection = d3.geo.albersUsa()
                .translate([w/2,h/2])
                .scale([d3.min([w,h*2])]);
            sourceJson = "../data/us-states.json"
        }

        path = d3.geo.path()
            .projection(projection)

        projection.mapname = mapname

        d3.json(sourceJson, function(json) {
            stateItems = maplevel.selectAll("path")
                .data(json.features)

            stateItems
                .exit()
                .remove()

            stateItems
                .enter()
                .append("path")
                .attr("d", path)
                .attr('fill',"grey")
        });

        return(projection)
    }
    return my
}

removeElements = function() {
    vals = ['rect','text','path','circle','line','tick'].map(function(type) {svg.selectAll(type).transition().remove()})
}


//I like this pallette--I think we usually need two tones to really discriminate,
//even though dataviz wisdom seems to say that's not kosher.

greenToRed = ["#D61818","#FFAE63","#FFFFBD","#B5E384"].reverse()
PuOr = ['rgb(84,39,136)','rgb(153,142,195)','rgb(216,218,235)','rgb(247,247,247)','rgb(254,224,182)','rgb(230,97,1)']

returnScale = function() {
    var colors = greenToRed,
    scaleType = d3.scale.log,
    values = [1,2,3,4,5]

    function my() {
        scale = scaleType().range(colors)
        numbers = d3.extent(values)
        //If we're using a log scale, the minimum can't be zero. So it's 0.1. Or actually a tiny bit less to get .1 inside the range.

        if (scaleType==d3.scale.log) {
            numbers[0] = d3.max([(1/101),d3.min(values)])
        }
        if (comparisontype()=='comparison') {
            // Make it symmetric for ratios.
            outerbound = d3.min([100,d3.max([1/d3.min(values),d3.max(values)])])
            numbers = [1/outerbound,outerbound]
        }
        min = numbers[0]
        max = numbers[1]
        if (scaleType==d3.scale.log) {

            min = Math.log(numbers[0])
            max = Math.log(numbers[1])
            scale.domain(d3.range(min,max,(max-min)/(colorscale.range().length)).map(function(n) {return(Math.exp(n))}))
        } else if (scaleType==d3.scale.sqrt) {
            scale.domain(d3.range(min,max,(max-min)/(colorscale.range().length-1)).map(function(n) {return(n^2)}))
        } else if (scaleType==d3.scale.linear) {
            scale.domain(d3.range(min,max+max*.0001,(max-min)/(colorscale.range().length-1)).map(function(n) {return(n)}))
        }
        scale.clamp()
        return (scale)
    }
    
    my.values = function(value) {
        if (!arguments.length) return values;
        values = value;
        return my;
    };
    
    my.colors = function(value) {
        if (!arguments.length) return colors;
        colors = value;
        return my;
    };
    
    my.scaleType = function(value) {
        if (!arguments.length) return scaleType;
        scaleType = value;
        return my;
    };
    return my
}


//define some default scales
nwords = d3.scale.sqrt().range([0,100]);
var sizescale = nwords
var colorscale = d3.scale.log().range(greenToRed);

function key(d) {return d.key;};

function popitup(url) {
    newwindow=window.open(url,'name','height=640,width=1000');
    if (window.focus) {newwindow.focus()}
    return false;
}

function destinationize(query) {
    //Constructs a cgi-bin request to local host.
    return( "/cgi-bin/dbbindings.py/?queryTerms=" + encodeURIComponent(JSON.stringify(query)))
};

function parseBookwormData(json,locQuery) {
    // Changes the shape of the hierarchical json the API delivers to a flat one with attribute names
    // which takes more space but plays more nicely with d3/javascript. Uses recursion, yuck.

    names = [].concat(locQuery.groups).concat(locQuery.counttype);
    function flatten(hash,prepend) {
        results = Object.keys(hash).map(function(key) {
            newpend = prepend.concat(key)
            if (hash[key] instanceof Array)
            {
                return(newpend.concat(hash[key]))
            }
            else {
                vals = flatten(hash[key],newpend)
                //is this doing anything different from return (vals)?
                return(
                    vals.map(function(array) {
                        return(array)
                    })
                )
            }
        })

        if (results[0][0] instanceof Array) {
            return(results.reduce(function(a,b){return(a.concat(b))}))
        } else {
            return(results)
        }
    }

    function toObject(names, values) {
        var result = {};
        for (var i = 0; i < names.length; i++) {
            result[names[i]] = values[i];}
        return result;
    };

    //run flatten initially with nothing prepended: as it recurses, that will get filled in.
    flat = flatten(json,[]);

    //add the labels.
    results = flat.map(function(localdata){
        return(toObject(names,localdata));
    })
    paperdata = results

    d3.keys(results[0]).map(function(key) {
        updateKeysTransformer(key)
    })
    return(results)
}

//Have to keep the data the same for subsequent calls, but this will transform them
plotTransformers = {};
dataTypes = {};

updateKeysTransformer = function(key) {
    //This is called for its side-effect: assigning a function to each key in plotTransformers
    //default: return as is.
    plotTransformers[key] = function(key) {return(key)}
    dataTypes[key]="Categorical"
    //if a date: return a dateTime object
    isADate = false
    key.split("_").map(function(part) {
        if (['year','month','day','week','decade','century',"Year","Decade","yearchunk"].indexOf(part) >=0) {isADate=true}
    })

    if (isADate) {
        plotTransformers[key] = function(originalValue) {
            datedValue = new Date()
            extractRelevantField = function(dateKey) {
                strings = dateKey.split("_")
                if (strings.length>1) {return strings[1]}
                return strings[0]
            }
            relevantField = extractRelevantField(key)
            if (['month','day','week'].indexOf(relevantField) >=0) {
                datedValue.setFullYear(0,0,originalValue)
            } else {
                datedValue.setFullYear(originalValue,1,1)
            }
            return datedValue
            //originalValue = datedValue
        }
        dataTypes[key]="Date"
        return

    }

    //if numeric: return a numeric object
    //iterate through all the values, and give up once hitting a non-numeric value
    for (var i =0; i < paperdata.length; i++) {
        entry = paperdata[i]
        d = entry[key]
        //console.log(d)
        if (isNaN(d) & d!="" & d!="None") {
            console.log("giving up on" + d)
            return
            break
        }
    }

    plotTransformers[key] = function(originalValue) {
        return parseFloat(originalValue)
    }
    dataTypes[key]="Numeric"
}

function comparisontype() {
    //This just tells various functions whether it's using a log scale centered around 1 (for comparisons between two words) or some other type of scale.
    //Maybe this function should also match up constraints between the two?
    //There are some differences in the legends and the titles depending if we're comparing to all
    //books or to certain ones. This should be useful for that.
    if ('aesthetic' in query) {
        //This should just test length, not for this particular key as it does.

        if (
	    (query['aesthetic']['color'] == 'WordsRatio')
	    | 
	    (query['aesthetic']['color']=='TextRatio')
	) {
            return('comparison');
        }
    } else {return("absolute")}
}

function updateQuery() {
    //make sure the box and the internal state are aligned
    APIbox.update()

    //assign comparison limits if necessary
    comparetype = comparisontype()

    dummy = {};
    if ('aesthetic' in query) {
	m = d3.keys(query['aesthetic'])
	m.map(function(d) {
           dummy[query['aesthetic'][d]] = 1
	}
	     );
	query['counttype'] = d3.keys(dummy);
	APIbox.update();
    }

    query = JSON.parse($("#APIbox").val())
}


topn = function(n,key,dataset) {
    //passed a full, parsed dataset, this filters by 'key' down to only the top n items. Useful for long-tail categorical distributions.
    vals = d3.nest().key(function(d) {return(d[key]);}).entries(dataset)
    perm = vals.map(function(val) {
        val.total = d3.sum(val.values,function(d) {return(d[query['aesthetic']['filterByTop']])})
        return(val)
    })
    perm.sort(function(a,b) {return(b.total-a.total)})
    terms = perm.map(function(a) {return(a.key)})
    return(
        terms.slice(0,n)
    )
}


prettyName = function(number) {
    if (comparisontype()!='comparison') {
        suffix = ''
        switch(true) {
        case number>=1000000000:
            number = number/1000000000
            suffix = 'B'
            break;
        case number>=1000000:
            number = number/1000000
            suffix = 'M'
            break;
        case number>=1000:
            number = number/1000
            suffix = 'K'
            break;
        }
        if (number < .1) {
            return(Math.round(number*100)/100+suffix)
        }
        return(Math.round(number*10)/10+suffix)
    }
    if (comparisontype()=='comparison') {
        if (number >= 1) {return(Math.round(number)) + ":1"}
        if (number < 1) {return("1:" + Math.round(1/number))}
    }
}

var legendData = [];

var currentPlot=myPlot()
currentPlot()
