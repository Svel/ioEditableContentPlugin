/**
 * When applied to an element, this makes that element inline-editable.
 *
 * This requires a number of options to be passed in:
 *   * form_url The base url to render the form
 *   * show_url The base url for rendering the element
 *   * delete_url The base url for deleting the element
 *   * mode     inline|fancybox (defaults to fancybox)
 *   * model    The model being edited (e.g. "Blog")
 *   * pk       The primary key of the object being modified
 *   * fields   Array, the fields on the model being modified
 *
 * Due to the many options, this is not usually called directly, but is
 * instead handled by the jsSuccess.js.php file, which applies this to
 * elements output using the special editable_content_tag() PHP helper.
 */
(function($) {

$.widget('ui.ioEditableContent', {
  
  options: {
    mode:         'fancybox',
    with_delete:  false
  },
  
  _create: function() {
    this.initialize();
  },
  
  openEditor: function() {
    var self = this;
    
    // disable the non-edit-mode controls
    this._disableControls();
    
    /*
     * 1) Ajax load the contents into the editor element
     * 2) Calls initializeEditor, which creates a editor object
     */
    if (this.option('mode') == 'inline')
    {
      self.element.load(self._getFormUrl(), function(responseText, textStatus, XMLHttpRequest) {
        if (textStatus == 'error')
        {
          self.element.html('Editor could not be loaded with error code '+XMLHttpRequest.status+': '+XMLHttpRequest.statusText+'<br/><br/>Url: '+self._getFormUrl());
        }
        self._initializeEditor(self.element);
      });
    }
    else
    {
      $.fancybox(self._getFormUrl(), {
        'zoomSpeedIn': 300,
        'zoomSpeedOut': 300,
        'overlayShow': true,
        'autoDimensions': false,
        'hideOnContentClick': false,
        'type': 'ajax',
        'onComplete': function() {
          self._initializeEditor($('#fancybox-content'));

            // WARNING: this line may cause problems with WYSIWYG editors (as far as it screwing up the size)
            // makes the window fit around the internal. This is needed
            // here because it means we've given the ajax'ed content a chance
            // to do its own javascript and resize its internals
            //$.fancybox.resize();
        },
        'onCleanup': function() {
          self.closeEditor();
        }
      });
    }
  },
  
  closeEditor: function() {
    var self = this;
    
    if (!this.getEditor())
    {
      return;
    }
    
    // kill the editor
    var editor = this.getEditor();
    this._setOption('content_editor', null);

    // this seems unnecessary, we'll wait and see.
    //self.blockUI();
    
    // ajax in the content, and then set things back up
    $(self.element).load(
      self._getShowUrl(),
      function() {
        // reinitialize the non-edit-mode controls
        self._enableControls();
        
        // make sure fancybox is closed
        $.fancybox.close();
        
        // destroy the editor
        editor.ioContentEditor('destroy');

        // this seems unnecessary, we'll wait and see.
        //self.unblockUI();
        
        // throw a close event to listen onto
        self.element.trigger('closeEditor');
      }
    );
  },
  
  deleteItem: function() {
    var self = this;
    
    if(confirm('Delete?')){
      $.ajax({
        url: self._getDeleteUrl(),
        success: function(data, textStatus, XMLHttpRequest)
        {
          // fade out then remove the element
          self.element.fadeOut(500, function(){
            self.destroy();
            $(this).remove();
          });
        },
        error: function(XMLHttpRequest, textStatus, errorThrown)
        {
          alert('Error deleting the object: '+XMLHttpRequest.status)
        }
      });
    }
    return false;
  },

  
  initialize: function() {
    var self = this;
    
    // register non-edit-handlers: effects for when the slot is not being edited    
    this._initializeControls();
    // attach the nonEditHandler events
    this._enableControls();
  },
  
  _initializeEditor: function(editorSelector) {
    // initializes the editor object on the given selector
    var self = this;
    
    editorSelector.ioContentEditor({});
    
    editorSelector.bind('close', function() {
      self.closeEditor();
    });

    // listen to the form response so we can repopulate the pk if needed to the metadata
    // necessary or the show request won't have the correct pk
    editorSelector.bind('formPostResponse', function(e, data) {
      if (data.pk)
      {
        self.option('pk', data.pk);
      }
    });

    // store the content_editor
    this._setOption('content_editor', editorSelector);
    
    // throw a close event to listen onto
    self.element.trigger('openEditor');
  },
  
  _initializeControls: function() {
    // initializes the edit controls
    var self = this;
    
    control_events = {};
    control_events['dblclick'] = function() {
      self.openEditor();
    }
    this._setOption('control_events', control_events);
  },
  
  _enableControls: function() {
    var self = this;
    
    // bind all of the non-edit-mode handlers
    $.each(this.option('control_events'), function(key, value) {
      self.element.bind(key, value);
    });

    // remove the class that says the editor is opened
    self.element.removeClass('editor_opened');

    // add the delete button if with_delete enabled
    if (self.option('with_delete'))
    {
      var delete_link = $('<a href="#" class="editable_content_link editable_delete_link" title="delete"></a>');

      delete_link.bind('click', function () {
        self.deleteItem()
      });

      self.element.prepend(delete_link);
    }

   // Deactivate any links, clicking cancel will bring up the editor
    $('a:not(.editable_content_link)', self.element).click(function() {
      if (confirm('Follow link? (Click "OK" to follow, or "Cancel" to edit this area.)')) {
        window.location($(this).attr('href'));
      }
      else
      {
        self.openEditor()
      }

      return false;
    });
  },
  
  _disableControls: function() {
    var self = this;
    
    // disable all of the non-edit-mode handlers
    $.each(this.option('control_events'), function(key, value) {
      self.element.unbind(key, value);
    });

    // add a class indicating the editor is opened
    self.element.addClass('editor_opened')
  },

  _getFormUrl: function(){
    return this.option('form_url')+'?'+this._getUrlQueryString();
  },

  _getShowUrl: function(){
    return this.option('show_url')+'?'+this._getUrlQueryString();
  },

  _getDeleteUrl: function() {
    var params = {};
    params.model = this.option('model');
    params.pk = this.option('pk');

    return this.option('delete_url')+'?'+jQuery.param(params);
  },

  _getUrlQueryString: function(){
    // returns the common query string needed for the form and show urls
    var params = {};
    params.model = this.option('model');
    params.pk = this.option('pk');
    params.fields = this.option('fields');
    params.default_values = this.option('default_values');

    if(typeof(this.option('form')) !== 'undefined')
    {
      params.form = this.option('form');
    }

    if(typeof(this.option('form_partial')) !== 'undefined')
    {
      params.form_partial = this.option('form_partial');
    }

    if(typeof(this.option('partial')) !== 'undefined')
    {
      params.partial = this.option('partial');
    }

    if(typeof(this.option('method')) !== 'undefined')
    {
      params.method = this.option('method');
    }

    return jQuery.param(params)
  },
  
  getEditor: function(){
    return this.option('content_editor');
  },

  blockUI: function() {
    if ($.blockUI)
    {
      $.blockUI();
    }
  },

  unblockUI: function() {
    if ($.blockUI)
    {
      $.unblockUI();
    }
  }
  
});

})(jQuery);
