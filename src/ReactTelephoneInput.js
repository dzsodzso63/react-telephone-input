'use strict';

var some = require('lodash/collection/some');
var findWhere = require('lodash/collection/findWhere');
var reduce = require('lodash/collection/reduce');
var map = require('lodash/collection/map');
var filter = require('lodash/collection/filter');
var findIndex = require('lodash/array/findIndex');
var first = require('lodash/array/first');
var rest = require('lodash/array/rest');
var debounce = require('lodash/function/debounce');
var memoize = require('lodash/function/memoize');
var assign = require('lodash/object/assign');
var isEqual = require('lodash/lang/isEqual');
// import lodash string methods
var trim = require('lodash/string/trim');
var startsWith = require('lodash/string/startsWith');

var React = require('react');
var ReactDOM = require('react-dom');
var createReactClass = require('create-react-class');
var PropTypes = require('prop-types');
var classNames = require('classnames');
var countryData = require('./country_data');
var allCountries = countryData.allCountries;
var allCountriesIso2Lookup = countryData.allCountriesIso2Lookup;

if (typeof document !== 'undefined') {
  var isModernBrowser = Boolean(document.createElement('input').setSelectionRange);
} else {
  var isModernBrowser = true;
}

var keys = {
        UP: 38,
        DOWN: 40,
        RIGHT: 39,
        LEFT: 37,
        ENTER: 13,
        ESC: 27,
        PLUS: 43,
        A: 65,
        Z: 90,
        SPACE: 32
};

function isNumberValid(inputNumber) {
    var countries = countryData.allCountries;
    return some(countries, function(country) {
        return startsWith(inputNumber, country.dialCode) || startsWith(country.dialCode, inputNumber);
    });
}

  export var ReactTelephoneInput = createReactClass({
    getInitialState() {
        var preferredCountries = this.props.preferredCountries.map(
            iso2 => allCountriesIso2Lookup.hasOwnProperty(iso2) ? allCountries[allCountriesIso2Lookup[iso2]] : null
        ).filter(val => val !== null);

        return assign(
            {},
            {
                preferredCountries: preferredCountries,
                queryString: '',
                freezeSelection: false,
                debouncedQueryStingSearcher: debounce(this.searchCountry, 100)
            },
            this._mapPropsToState(this.props)
        );
    },
    propTypes: {
        autofocus: PropTypes.bool,
        value: PropTypes.string,
        initialValue: PropTypes.string,
        autoFormat: PropTypes.bool,
        defaultCountry: PropTypes.string,
        onlyCountries: PropTypes.arrayOf(PropTypes.object),
        preferredCountries: PropTypes.arrayOf(PropTypes.string),
        classNames: PropTypes.string,
        onChange: PropTypes.func,
        onEnterKeyPress: PropTypes.func,
        onBlur: PropTypes.func,
        onFocus: PropTypes.func
    },
    getDefaultProps() {
        return {
            value: '',
            autofocus: false,
            initialValue: '',
            autoFormat: true,
            onlyCountries: allCountries,
            defaultCountry: allCountries[0].iso2,
            isValid: isNumberValid,
            flagsImagePath: 'flags.png',
            onEnterKeyPress: function () {},
            preferredCountries: []
        };
    },
    getNumber() {
        return this.state.formattedNumber !== '+' ? this.state.formattedNumber : '';
    },
    getValue() {
        return this.getNumber();
    },
    componentDidMount() {
        this._cursorToEnd(true);
        if(typeof this.props.onChange === 'function') {
            this.props.onChange(this.state.formattedNumber, this.state.selectedCountry);
        }
    },
    shouldComponentUpdate(nextProps, nextState) {
        return !isEqual(nextProps, this.props) || !isEqual(nextState, this.state);
    },
    componentWillReceiveProps(nextProps) {
        this.setState(this._mapPropsToState(nextProps));
    },
    formatNumber(text, pattern) {
        if(!text || text.length === 0) {
            return '+';
        }

        // for all strings with length less than 3, just return it (1, 2 etc.)
        // also return the same text if the selected country has no fixed format
        if((text && text.length < 2) || !pattern || !this.props.autoFormat) {
            return `+${text}`;
        }

        var formattedObject = reduce(pattern, function(acc, character) {
            if(acc.remainingText.length === 0) {
                return acc;
            }

            if(character !== '.') {
                return {
                    formattedText: acc.formattedText + character,
                    remainingText: acc.remainingText
                };
            }

            return {
                formattedText: acc.formattedText + first(acc.remainingText),
                remainingText: rest(acc.remainingText)
            };
        }, {formattedText: '', remainingText: text.split('')});
        return formattedObject.formattedText + formattedObject.remainingText.join('');
    },

    // put the cursor to the end of the input (usually after a focus event)
    _cursorToEnd(skipFocus) {
        var input = this.refs.numberInput;
        if (skipFocus) {
            this._fillDialCode();
        } else {
            input.focus();

            if (isModernBrowser) {
                var len = input.value.length;
                input.setSelectionRange(len, len);
            }
        }
    },
    // memoize results based on the first 5/6 characters. That is all that matters
    guessSelectedCountry: memoize(function(inputNumber) {
        var secondBestGuess = findWhere(allCountries, {iso2: this.props.defaultCountry}) || this.props.onlyCountries[0];
        if(trim(inputNumber) !== '') {
            var bestGuess = reduce(this.props.onlyCountries, function(selectedCountry, country) {
                            if(startsWith(inputNumber, country.dialCode)) {
                                if(country.dialCode.length > selectedCountry.dialCode.length) {
                                    return country;
                                }
                                if(country.dialCode.length === selectedCountry.dialCode.length && country.priority < selectedCountry.priority) {
                                    return country;
                                }
                            }

                            return selectedCountry;
                        }, {dialCode: '', priority: 10001}, this);
        } else {
            return secondBestGuess;
        }

        if(!bestGuess.name) {
            return secondBestGuess;
        }

        return bestGuess;
    }),
    handleInput(event) {
        var formattedNumber = '+', newSelectedCountry = this.state.selectedCountry, freezeSelection = this.state.freezeSelection;

        // if the input is the same as before, must be some special key like enter etc.
        if(event.target.value === this.state.formattedNumber) {
            return;
        }

        // ie hack
        if(event.preventDefault) {
            event.preventDefault();
        } else {
            event.returnValue = false;
        }

        if(event.target.value.length > 0) {
            // before entering the number in new format, lets check if the dial code now matches some other country
            var inputNumber = event.target.value.replace(/\D/g, '');

            // we don't need to send the whole number to guess the country... only the first 6 characters are enough
            // the guess country function can then use memoization much more effectively since the set of input it gets has drastically reduced
            if(!this.state.freezeSelection || this.state.selectedCountry.dialCode.length > inputNumber.length) {
                newSelectedCountry = this.guessSelectedCountry(inputNumber.substring(0, 6));
                freezeSelection = false;
            }
            // let us remove all non numerals from the input
            formattedNumber = this.formatNumber(inputNumber, newSelectedCountry.format);
        }

        var caretPosition = event.target.selectionStart;
        var oldFormattedText = this.state.formattedNumber;
        var diff = formattedNumber.length - oldFormattedText.length;

        this.setState({
            formattedNumber: formattedNumber,
            freezeSelection: freezeSelection,
            selectedCountry: newSelectedCountry.dialCode.length > 0 ? newSelectedCountry : this.state.selectedCountry
        }, function() {
            if(isModernBrowser) {
                if(diff > 0) {
                    caretPosition = caretPosition - diff;
                }

                if(caretPosition > 0 && oldFormattedText.length >= formattedNumber.length) {
                    this.refs.numberInput.setSelectionRange(caretPosition, caretPosition);
                }
            }

            if(this.props.onChange) {
                this.props.onChange(this.state.formattedNumber, this.state.selectedCountry);
            }
        });

    },
    handleInputFocus() {
        // trigger parent component's onFocus handler
        if(typeof this.props.onFocus === 'function') {
            this.props.onFocus(this.state.formattedNumer, this.state.selectedCountry);
        }

        this._fillDialCode();
    },
    _mapPropsToState(props) {
        var inputNumber = props.initialValue || props.value || '';
        var selectedCountryGuess = this.guessSelectedCountry(inputNumber.replace(/\D/g, ''));
        var selectedCountryGuessIndex = findIndex(allCountries, selectedCountryGuess);
        var formattedNumber = this.formatNumber(
            inputNumber.replace(/\D/g, ''), selectedCountryGuess ? selectedCountryGuess.format : null
        );
        return {
            selectedCountry: selectedCountryGuess,
            highlightCountryIndex: selectedCountryGuessIndex,
            formattedNumber: formattedNumber
        }
    },
    _fillDialCode() {
        // if the input is blank, insert dial code of the selected country
        // somtimes we choke and forget what the hell a number input is -_-
        if(this.refs.numberInput && this.refs.numberInput.value === '+') {
            this.setState({formattedNumber: '+' + this.state.selectedCountry.dialCode});
        }
    },
    // memoize search results... caching all the way
    _searchCountry: memoize(function(queryString) {
        if(!queryString || queryString.length === 0) {
            return null;
        }
        // don't include the preferred countries in search
        var probableCountries = filter(this.props.onlyCountries, function(country) {
            return startsWith(country.name.toLowerCase(), queryString.toLowerCase());
        }, this);
        return probableCountries[0];
    }),
    searchCountry() {
        const probableCandidate = this._searchCountry(this.state.queryString) || this.props.onlyCountries[0];
        const probableCandidateIndex = findIndex(this.props.onlyCountries, probableCandidate) + this.state.preferredCountries.length;

        this.setState({
            queryString: '',
            highlightCountryIndex: probableCandidateIndex
        });
    },
    handleInputKeyDown(event) {
        if(event.which === keys.ENTER) {
            this.props.onEnterKeyPress(event);
        }
    },
    handleInputBlur() {
      if(typeof this.props.onBlur === 'function') {
        this.props.onBlur(this.state.formattedNumber, this.state.selectedCountry);
      }
    },
    render() {
        var inputClasses = classNames({
            'form-control': true,
            'invalid-number': !this.props.isValid(this.state.formattedNumber.replace(/\D/g, ''))
          }, this.props.classNames);

        return (
          <input
              onChange={this.handleInput}
              onClick={this.handleInputClick}
              onFocus={this.handleInputFocus}
              onBlur={this.handleInputBlur}
              onKeyDown={this.handleInputKeyDown}
              value={this.state.formattedNumber}
              autoFocus={this.props.autoFocus}
              ref="numberInput"
              type="tel"
              className={inputClasses}
              autoComplete='tel'
              placeholder='+1 (702) 123-4567' />
        );
    }
});

export default ReactTelephoneInput;
